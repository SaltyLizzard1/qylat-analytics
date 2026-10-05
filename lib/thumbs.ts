import { unstable_cache } from 'next/cache';
import { sql } from '@/lib/db';
import { metaConfig } from '@/lib/meta';

/**
 * A fresh thumbnail for a post whose stored one has stopped loading.
 *
 * Why stored thumbnails fail: Meta's image links are signed and stop working
 * about four and a half days after they are issued. The daily sync reissues
 * them, but only for posts inside its lookback, which the cron sets to 7 days.
 * So a post older than about eleven days has a dead link in thumbnail_url, and
 * on 2026-10-05 that was 33 of the 47 posts from the last 30 days.
 *
 * This asks Meta for a new link for one post, when a page actually needs it.
 * Nothing is written to the database: the new link is held in Next's data
 * cache for twelve hours, well inside its lifetime, so a post costs one Graph
 * call per half day however many times it is viewed.
 *
 * What it is careful about:
 *   - The token stays on the server. It is read from the environment, sent
 *     only to graph.facebook.com, and never appears in a response, a redirect
 *     or an error message.
 *   - Only this dashboard's own posts. The caller gives a row ID, and the
 *     Graph ID comes from that row in the database, never from the request.
 *   - Only an image on Meta's own CDN is ever redirected to.
 *   - Failure is not retried in a loop. See the three outcomes below.
 *
 * Only Instagram and the Facebook Page can be recovered. The Facebook Profile
 * has no API, and its posts have no stored image at all.
 */

const CACHE_SECONDS = 12 * 60 * 60;

/** How long one post is left alone after a failure that might be temporary. */
const POST_RETRY_MS = 10 * 60 * 1000;
/** How long every recovery is paused once Meta is clearly refusing or failing. */
const PAUSE_MS = 10 * 60 * 1000;
/** Temporary failures in a row, across posts, before the pause starts. */
const FAILURES_BEFORE_PAUSE = 3;

/**
 * - url: a working image link.
 * - none: Meta says this post has no image, or the post is not one of ours.
 *   Remembered for twelve hours.
 * - unavailable: could not ask, or the answer was not usable. Not remembered
 *   as "none", but not asked again straight away either.
 */
export type ThumbResult =
  | { kind: 'url'; url: string }
  | { kind: 'none' }
  | { kind: 'unavailable'; retryAfterSeconds: number };

class UnavailableError extends Error {
  /** True when asking again cannot help until something is fixed: a bad token, a missing permission. */
  constructor(
    message: string,
    readonly refused = false
  ) {
    super(message);
  }
}

/**
 * Held in memory, per server instance. A serverless instance is short lived,
 * so this is a brake on a burst, which is the case that matters: one page of
 * thirty expired images asking thirty times while Meta is down. The browser
 * is told to wait as well, by Cache-Control on the route.
 */
const postRetryAt = new Map<number, number>();
let pausedUntil = 0;
let failuresInARow = 0;

/** Meta error codes that mean the token or its permissions are the problem. */
const REFUSAL_CODES = new Set([10, 102, 190, 200, 2500]);

function isMetaImage(candidate: string | undefined): candidate is string {
  if (!candidate) return false;
  try {
    const u = new URL(candidate);
    return u.protocol === 'https:' && /(^|\.)(fbcdn\.net|cdninstagram\.com)$/.test(u.hostname);
  } catch {
    return false;
  }
}

async function fetchFresh(postId: number): Promise<string | null> {
  const rows = await sql`
    SELECT platform, platform_post_id
    FROM posts
    WHERE id = ${postId} AND platform IN ('instagram', 'facebook') AND platform_post_id IS NOT NULL
  `;
  const post = rows[0];
  if (!post) return null;

  const cfg = metaConfig();
  const fields = post.platform === 'instagram' ? 'media_type,thumbnail_url,media_url' : 'full_picture';
  const url = new URL(`${cfg.graphBase}/${encodeURIComponent(post.platform_post_id as string)}`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('access_token', cfg.token);

  let response: Response;
  try {
    response = await fetch(url.toString(), { cache: 'no-store' });
  } catch {
    // The underlying message can carry the request URL, token included, so it
    // is dropped rather than passed on.
    throw new UnavailableError('network failure reaching the Graph API');
  }

  let body: {
    media_type?: string;
    thumbnail_url?: string;
    media_url?: string;
    full_picture?: string;
    error?: { code?: number; message?: string };
  };
  try {
    body = await response.json();
  } catch {
    throw new UnavailableError(`Graph API answered HTTP ${response.status} without JSON`);
  }

  if (!response.ok) {
    const code = body.error?.code;
    if (response.status >= 500 || response.status === 429 || code === 4 || code === 17 || code === 32 || code === 613) {
      throw new UnavailableError(`Graph API is busy or limiting requests (HTTP ${response.status}, code ${code ?? 'none'})`);
    }
    if (response.status === 401 || response.status === 403 || (code !== undefined && REFUSAL_CODES.has(code))) {
      throw new UnavailableError(`Graph API refused the token (HTTP ${response.status}, code ${code ?? 'none'})`, true);
    }
    // Anything else is Meta saying this object is gone or has no such field.
    return null;
  }

  const candidate =
    post.platform === 'facebook'
      ? body.full_picture
      : // For a video, media_url is the video file. Only thumbnail_url is an image.
        body.media_type === 'VIDEO'
        ? body.thumbnail_url
        : (body.thumbnail_url ?? body.media_url);
  return isMetaImage(candidate) ? candidate : null;
}

const cachedFresh = (postId: number) =>
  unstable_cache(() => fetchFresh(postId), ['post-thumbnail', String(postId)], { revalidate: CACHE_SECONDS })();

/**
 * A working image link for this post, "none", or "unavailable". Never throws,
 * and never asks Meta again for a post, or at all, while a recent failure says
 * it would not help.
 */
export async function freshThumbnail(postId: number): Promise<ThumbResult> {
  const now = Date.now();
  const wait = Math.max(pausedUntil, postRetryAt.get(postId) ?? 0) - now;
  if (wait > 0) return { kind: 'unavailable', retryAfterSeconds: Math.ceil(wait / 1000) };

  try {
    const url = await cachedFresh(postId);
    failuresInARow = 0;
    postRetryAt.delete(postId);
    return url ? { kind: 'url', url } : { kind: 'none' };
  } catch (e) {
    const refused = e instanceof UnavailableError && e.refused;
    failuresInARow += 1;
    postRetryAt.set(postId, now + POST_RETRY_MS);
    if (refused || failuresInARow >= FAILURES_BEFORE_PAUSE) {
      pausedUntil = now + PAUSE_MS;
      failuresInARow = 0;
      // Logged once per pause, not once per image. The message never holds the token.
      console.error(
        `[thumbs] Thumbnail recovery paused for ${PAUSE_MS / 60000} minutes: ${
          e instanceof UnavailableError ? e.message : 'unexpected failure'
        }`
      );
    }
    if (postRetryAt.size > 2000) postRetryAt.clear();
    return { kind: 'unavailable', retryAfterSeconds: Math.ceil(POST_RETRY_MS / 1000) };
  }
}
