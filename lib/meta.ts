/**
 * Meta Graph API client for the QYLAT Facebook Page and its linked Instagram account.
 *
 * Replaces the Supermetrics ingestion that was planned but never built.
 *
 * Two metric renames matter here and are already applied below:
 *   Instagram: `impressions` is dead for media created after 2024-07-02. Use `views`.
 *   Facebook:  `post_impressions` is dead. Use `post_media_view`.
 *              `post_impressions_unique` is dead. Use `post_total_media_view_unique`.
 *
 * Counts that the object itself reports (likes, comments, shares) are read from
 * object fields rather than the insights edge. Those fields are stable across
 * versions, the insights edge is not.
 */

const DEFAULT_GRAPH_VERSION = 'v25.0';

export type MetaConfig = {
  graphBase: string;
  pageId: string;
  igUserId: string;
  token: string;
};

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly path: string,
    readonly code?: number,
    readonly type?: string,
    readonly fbtraceId?: string
  ) {
    super(message);
    this.name = 'MetaApiError';
  }
}

/**
 * Reads Meta credentials from the environment.
 * Throws naming every missing variable so a misconfigured deploy fails loudly.
 */
export function metaConfig(): MetaConfig {
  const missing: string[] = [];
  const pageId = process.env.META_PAGE_ID;
  const igUserId = process.env.META_IG_USER_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;

  if (!pageId) missing.push('META_PAGE_ID');
  if (!igUserId) missing.push('META_IG_USER_ID');
  if (!token) missing.push('META_PAGE_ACCESS_TOKEN');

  if (missing.length > 0) {
    throw new Error(`Missing Meta environment variables: ${missing.join(', ')}`);
  }

  const version = process.env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;

  return {
    graphBase: `https://graph.facebook.com/${version}`,
    pageId: pageId as string,
    igUserId: igUserId as string,
    token: token as string,
  };
}

export function errText(e: unknown): string {
  if (e instanceof MetaApiError) {
    return `${e.message}${e.code ? ` (code ${e.code})` : ''}`;
  }
  return e instanceof Error ? e.message : String(e);
}

type GraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

async function graphGet<T>(
  cfg: MetaConfig,
  path: string,
  params: Record<string, string>
): Promise<T> {
  const url = new URL(`${cfg.graphBase}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', cfg.token);

  let response: Response;
  try {
    response = await fetch(url.toString(), { cache: 'no-store' });
  } catch (e) {
    throw new MetaApiError(
      `Network failure calling Graph API: ${e instanceof Error ? e.message : String(e)}`,
      path
    );
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new MetaApiError(
      `Graph API returned non-JSON (HTTP ${response.status}): ${text.slice(0, 200)}`,
      path
    );
  }

  const err = (body as GraphErrorBody).error;
  if (err) {
    throw new MetaApiError(
      err.message ?? `Graph API error (HTTP ${response.status})`,
      path,
      err.code,
      err.type,
      err.fbtrace_id
    );
  }

  if (!response.ok) {
    throw new MetaApiError(`Graph API HTTP ${response.status}`, path);
  }

  return body as T;
}

/** Follows `paging.next` until exhausted or `maxPages` is reached. */
async function graphGetAll<T>(
  cfg: MetaConfig,
  path: string,
  params: Record<string, string>,
  maxPages = 10
): Promise<T[]> {
  const out: T[] = [];
  let page = await graphGet<{ data: T[]; paging?: { next?: string } }>(cfg, path, params);
  out.push(...(page.data ?? []));

  let pageCount = 1;
  while (page.paging?.next && pageCount < maxPages) {
    let response: Response;
    try {
      response = await fetch(page.paging.next, { cache: 'no-store' });
    } catch (e) {
      throw new MetaApiError(
        `Network failure paging: ${e instanceof Error ? e.message : String(e)}`,
        path
      );
    }
    const body = (await response.json()) as { data: T[]; paging?: { next?: string } } & GraphErrorBody;
    if (body.error) {
      throw new MetaApiError(body.error.message ?? 'Graph API error while paging', path, body.error.code);
    }
    out.push(...(body.data ?? []));
    page = body;
    pageCount += 1;
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Insights                                                            */
/* ------------------------------------------------------------------ */

type InsightRow = {
  name: string;
  values?: { value: unknown }[];
};

export type InsightResult = {
  values: Record<string, number>;
  failed: { metric: string; reason: string }[];
};

function reduceInsights(rows: InsightRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const raw = row.values?.[0]?.value;
    if (typeof raw === 'number') {
      out[row.name] = raw;
    } else if (raw && typeof raw === 'object') {
      // Breakdown metrics such as post_reactions_by_type_total return
      // { like: 12, love: 3 }. Sum the buckets.
      out[row.name] = Object.values(raw as Record<string, unknown>).reduce<number>(
        (sum, v) => sum + (typeof v === 'number' ? v : 0),
        0
      );
    }
  }
  return out;
}

/**
 * Requests all metrics in one call. If Meta rejects the batch, which it does
 * when any single metric is unsupported for that object, retries one metric at
 * a time so a single bad metric does not cost the whole object.
 *
 * Every metric that fails is returned in `failed` with its reason. Nothing is
 * swallowed.
 */
async function fetchInsights(
  cfg: MetaConfig,
  objectId: string,
  metrics: string[]
): Promise<InsightResult> {
  if (metrics.length === 0) return { values: {}, failed: [] };

  try {
    const body = await graphGet<{ data: InsightRow[] }>(cfg, `${objectId}/insights`, {
      metric: metrics.join(','),
    });
    return { values: reduceInsights(body.data ?? []), failed: [] };
  } catch (batchError) {
    const values: Record<string, number> = {};
    const failed: { metric: string; reason: string }[] = [];

    for (const metric of metrics) {
      try {
        const body = await graphGet<{ data: InsightRow[] }>(cfg, `${objectId}/insights`, { metric });
        Object.assign(values, reduceInsights(body.data ?? []));
      } catch (e) {
        failed.push({ metric, reason: errText(e) });
      }
    }

    if (Object.keys(values).length === 0) {
      failed.unshift({ metric: metrics.join(','), reason: errText(batchError) });
    }

    return { values, failed };
  }
}

/* ------------------------------------------------------------------ */
/* Facebook Page                                                       */
/* ------------------------------------------------------------------ */

export type FacebookPost = {
  id: string;
  created_time: string;
  message?: string;
  permalink_url?: string;
  full_picture?: string;
  shares?: { count?: number };
  comments?: { summary?: { total_count?: number } };
  reactions?: { summary?: { total_count?: number } };
  attachments?: { data?: { media_type?: string }[] };
};

const FACEBOOK_POST_FIELDS = [
  'id',
  'created_time',
  'message',
  'permalink_url',
  'full_picture',
  'shares',
  'comments.summary(total_count).limit(0)',
  'reactions.summary(total_count).limit(0)',
  'attachments{media_type}',
].join(',');

const FACEBOOK_POST_METRICS = [
  'post_media_view',
  'post_total_media_view_unique',
  'post_clicks',
];

export async function fetchFacebookPosts(cfg: MetaConfig, since: Date): Promise<FacebookPost[]> {
  return graphGetAll<FacebookPost>(cfg, `${cfg.pageId}/posts`, {
    fields: FACEBOOK_POST_FIELDS,
    since: String(Math.floor(since.getTime() / 1000)),
    limit: '50',
  });
}

export async function fetchFacebookPostInsights(
  cfg: MetaConfig,
  postId: string
): Promise<InsightResult> {
  return fetchInsights(cfg, postId, FACEBOOK_POST_METRICS);
}

/* ------------------------------------------------------------------ */
/* Instagram                                                           */
/* ------------------------------------------------------------------ */

export type InstagramMedia = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
};

const INSTAGRAM_MEDIA_FIELDS = [
  'id',
  'caption',
  'media_type',
  'media_product_type',
  'permalink',
  'thumbnail_url',
  'media_url',
  'timestamp',
  'like_count',
  'comments_count',
].join(',');

/**
 * Metric support differs by media type and Meta rejects the whole request if
 * one metric does not apply. These lists come from the current media insights
 * reference. `fetchInsights` degrades per metric if a list is still wrong for
 * this account.
 */
function instagramMetricsFor(media: InstagramMedia): string[] {
  const productType = (media.media_product_type ?? '').toUpperCase();

  if (productType === 'STORY') {
    return ['views', 'reach', 'replies', 'shares', 'profile_visits', 'follows'];
  }

  if (productType === 'REELS') {
    return ['views', 'reach', 'saved', 'shares', 'total_interactions'];
  }

  return ['views', 'reach', 'saved', 'shares', 'total_interactions', 'profile_visits'];
}

export async function fetchInstagramMedia(cfg: MetaConfig, since: Date): Promise<InstagramMedia[]> {
  return graphGetAll<InstagramMedia>(cfg, `${cfg.igUserId}/media`, {
    fields: INSTAGRAM_MEDIA_FIELDS,
    since: String(Math.floor(since.getTime() / 1000)),
    limit: '50',
  });
}

export async function fetchInstagramMediaInsights(
  cfg: MetaConfig,
  media: InstagramMedia
): Promise<InsightResult> {
  return fetchInsights(cfg, media.id, instagramMetricsFor(media));
}

/* ------------------------------------------------------------------ */
/* Mapping helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Maps to the `format` values the posts table already allows:
 * reel, carousel, story, short, bio, other.
 */
export function instagramFormat(media: InstagramMedia): string {
  const productType = (media.media_product_type ?? '').toUpperCase();
  if (productType === 'REELS') return 'reel';
  if (productType === 'STORY') return 'story';
  if ((media.media_type ?? '').toUpperCase() === 'CAROUSEL_ALBUM') return 'carousel';
  return 'other';
}

/**
 * Facebook format, from two signals because neither is sufficient alone.
 *
 * The Page /posts edge has no media_product_type, but a Reel's permalink_url
 * is /reel/<id>/ while an ordinary post is /<page-id>/posts/<id>. That
 * separates Reels exactly. It cannot separate a single photo from an album,
 * which is what attachments.media_type is for: `album` is a multi photo post,
 * which is a carousel.
 *
 * media_type alone cannot identify a Reel, since an ordinary Facebook video
 * also reports `video`. Hence both.
 *
 * The /video_reels edge is the authoritative alternative, but it returns video
 * IDs that do not match the composite post IDs from /posts, so it needs a merge
 * step to say what the permalink already says. Kept in reserve.
 */
export function facebookFormat(post: FacebookPost): string {
  if ((post.permalink_url ?? '').includes('/reel/')) return 'reel';
  if (facebookMediaType(post)?.toLowerCase() === 'album') return 'carousel';
  return 'other';
}

/** Raw attachment media_type, stored for debugging what Meta actually said. */
export function facebookMediaType(post: FacebookPost): string | null {
  return post.attachments?.data?.[0]?.media_type ?? null;
}

const GO_SLUG_PATTERN = /\/go\/([a-z0-9-]{2,50})/i;

/** Pulls a /go/ slug out of a caption so a post can be joined to its short link. */
export function slugFromCaption(caption: string | null | undefined): string | null {
  if (!caption) return null;
  const match = caption.match(GO_SLUG_PATTERN);
  return match ? match[1].toLowerCase() : null;
}
