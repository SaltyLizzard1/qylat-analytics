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
 * Only Instagram and the Facebook Page can be recovered. The Facebook Profile
 * has no API, and its posts have no stored image at all.
 */

const CACHE_SECONDS = 12 * 60 * 60;

/** Thrown for a failure worth retrying. Not cached, unlike a definite "no image". */
class TransientThumbError extends Error {}

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
  } catch (e) {
    throw new TransientThumbError(`Network failure calling Graph API: ${e instanceof Error ? e.message : String(e)}`);
  }
  // 4xx is Meta saying this post has gone or cannot be read: a definite no.
  // Anything else may work next time, so it must not be remembered.
  if (response.status >= 500 || response.status === 429) {
    throw new TransientThumbError(`Graph API returned HTTP ${response.status}`);
  }
  if (!response.ok) return null;

  const body = (await response.json()) as {
    media_type?: string;
    thumbnail_url?: string;
    media_url?: string;
    full_picture?: string;
  };
  if (post.platform === 'facebook') return body.full_picture ?? null;
  // For a video, media_url is the video file. Only thumbnail_url is an image.
  if (body.media_type === 'VIDEO') return body.thumbnail_url ?? null;
  return body.thumbnail_url ?? body.media_url ?? null;
}

/**
 * A working image link for this post, or null when Meta has none. Throws on a
 * failure that may be temporary, which the route reports without caching.
 */
export function freshThumbnail(postId: number): Promise<string | null> {
  return unstable_cache(() => fetchFresh(postId), ['post-thumbnail', String(postId)], {
    revalidate: CACHE_SECONDS,
  })();
}
