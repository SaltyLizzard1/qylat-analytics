/**
 * YouTube, read through the official YouTube Data API v3 with an API key.
 *
 * Only public data: a channel's videos with their title, description,
 * thumbnail, publish time, duration and link, and the public counts for
 * views, likes and comments, plus the channel's subscriber count. Watch
 * time, retention, traffic sources and anything else from YouTube Studio
 * live in the YouTube Analytics API, which needs the channel owner to sign
 * in with OAuth. That is a follow-up and nothing here touches it.
 *
 * What the figures are, from the API's own documentation:
 *
 *   viewCount     the video's running total. For a Short, since 31 March
 *                 2025, a view is "the number of times your Short starts to
 *                 play or replay, with no minimum watch time requirement".
 *                 Reported views, never unique viewers.
 *   likeCount     absent when the owner hides likes. Stored as unknown.
 *   commentCount  absent when comments are turned off. Stored as unknown.
 *   subscriberCount  rounded down to three significant figures above 1,000,
 *                 and absent when the channel hides it.
 *
 * A count the API leaves out is null here and stays null in the database. It
 * is never written as zero.
 *
 * Shorts. The API has no field that says a video is a Short, and its
 * documentation describes no way to tell. Duration cannot decide it: a
 * landscape video of 40 seconds is not a Short. What this does instead is
 * ask for the channel's Shorts playlist, whose id is the channel id with its
 * "UC" prefix replaced by "UUSH" (and "UULF" for ordinary videos). YouTube
 * serves those playlists through the ordinary playlistItems endpoint, but
 * the naming is a convention and is not in the official reference, so it is
 * treated as evidence that can be missing: a video found in the Shorts list
 * is a Short, one found in the videos list is a video, and one found in
 * neither is recorded as unclassified, never guessed.
 *
 * Quota. Every call here costs 1 unit against a default 10,000 a day:
 * one for the channel, one per 50 uploads listed, one per 50 in each of the
 * two classification lists, and one per 50 videos read. A channel with 200
 * videos costs about 14 units a run. search.list, which has its own limit of
 * 100 calls a day, is not used.
 *
 * No imports from the app, and the network call is passed in, so the whole
 * of this can be tested against recorded responses.
 */

export type YouTubeConfig = { apiKey: string; channelId: string; base: string };

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

export const YOUTUBE_SOURCE = 'youtube-data-api-v3';
const DEFAULT_BASE = 'https://www.googleapis.com/youtube/v3';

/** Reads the configuration from the environment. Throws a message that names what is missing, never a value. */
export function youtubeConfig(env: Record<string, string | undefined> = process.env): YouTubeConfig {
  const apiKey = env.YOUTUBE_API_KEY ?? '';
  const channelId = env.YOUTUBE_CHANNEL_ID ?? '';
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is not set');
  if (!/^UC[\w-]{22}$/.test(channelId)) throw new Error('YOUTUBE_CHANNEL_ID is not set to a channel id (24 characters starting with UC)');
  // YOUTUBE_API_BASE exists for tests, which point it at recorded responses.
  return { apiKey, channelId, base: env.YOUTUBE_API_BASE || DEFAULT_BASE };
}

export class YouTubeApiError extends Error {
  status: number;
  reason: string;
  constructor(status: number, reason: string, message: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

/** One GET. The key travels as a parameter and is never part of an error message. */
async function get<T>(cfg: YouTubeConfig, fetcher: Fetcher, path: string, params: Record<string, string>, calls: { n: number }): Promise<T> {
  const q = new URLSearchParams({ ...params, key: cfg.apiKey });
  calls.n += 1;
  const res = await fetcher(`${cfg.base}/${path}?${q.toString()}`);
  if (!res.ok) {
    let reason = 'unknown';
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } };
      reason = body.error?.errors?.[0]?.reason ?? reason;
      message = body.error?.message ?? message;
    } catch {
      // The body was not JSON. The status is all there is.
    }
    throw new YouTubeApiError(res.status, reason, `YouTube ${path} failed: ${message} (${reason})`);
  }
  return (await res.json()) as T;
}

/** "PT1H2M3S" to seconds. Null for anything that is not a duration, such as a live stream still running. */
export function parseDuration(iso: string | undefined | null): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso ?? '');
  if (!m || iso === 'P0D') return null;
  const [d, h, min, s] = m.slice(1).map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

/** A count from the API, which sends numbers as strings and leaves hidden ones out. */
function count(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type Channel = {
  id: string;
  title: string;
  uploadsPlaylist: string;
  /** Null when the channel hides its subscriber count. Rounded by YouTube above 1,000. */
  subscribers: number | null;
  subscribersHidden: boolean;
};

export async function fetchChannel(cfg: YouTubeConfig, fetcher: Fetcher, calls: { n: number }): Promise<Channel> {
  const body = await get<{
    items?: {
      id: string;
      snippet?: { title?: string };
      statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }[];
  }>(cfg, fetcher, 'channels', { part: 'snippet,statistics,contentDetails', id: cfg.channelId }, calls);
  const c = body.items?.[0];
  if (!c) throw new Error('YouTube returned no channel for YOUTUBE_CHANNEL_ID');
  const uploads = c.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error('The channel has no uploads playlist');
  const hidden = c.statistics?.hiddenSubscriberCount === true;
  return {
    id: c.id,
    title: c.snippet?.title ?? '',
    uploadsPlaylist: uploads,
    subscribers: hidden ? null : count(c.statistics?.subscriberCount),
    subscribersHidden: hidden,
  };
}

type PlaylistPage = { items?: { contentDetails?: { videoId?: string; videoPublishedAt?: string } }[]; nextPageToken?: string };

/**
 * Video ids in a playlist, newest first, stopping at `since`, at `maxPages`,
 * or at the end. A playlist that does not exist returns null, which for the
 * classification lists means "no evidence", not "no videos".
 */
export async function fetchPlaylistVideoIds(
  cfg: YouTubeConfig,
  fetcher: Fetcher,
  playlistId: string,
  calls: { n: number },
  opts: { since?: Date; maxPages?: number } = {}
): Promise<string[] | null> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < (opts.maxPages ?? 20); page++) {
    let body: PlaylistPage;
    try {
      body = await get<PlaylistPage>(
        cfg,
        fetcher,
        'playlistItems',
        { part: 'contentDetails', playlistId, maxResults: '50', ...(pageToken ? { pageToken } : {}) },
        calls
      );
    } catch (e) {
      if (e instanceof YouTubeApiError && e.status === 404) return null;
      throw e;
    }
    let reachedOlder = false;
    for (const item of body.items ?? []) {
      const id = item.contentDetails?.videoId;
      const at = item.contentDetails?.videoPublishedAt;
      if (!id) continue;
      if (opts.since && at && new Date(at).getTime() < opts.since.getTime()) {
        reachedOlder = true;
        continue;
      }
      ids.push(id);
    }
    pageToken = body.nextPageToken;
    if (!pageToken || reachedOlder) break;
  }
  return ids;
}

export type VideoKind = 'short' | 'video' | 'unclassified';

export type Video = {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  durationSeconds: number | null;
  url: string;
  kind: VideoKind;
  /** Why it has that kind, in words, for the record. */
  kindEvidence: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
};

type VideoResource = {
  id: string;
  snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string } | undefined> };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};

/** The best thumbnail on offer, largest first. */
function thumbnail(t: VideoResource['snippet']): string | null {
  const s = t?.thumbnails ?? {};
  return s.maxres?.url ?? s.standard?.url ?? s.high?.url ?? s.medium?.url ?? s.default?.url ?? null;
}

/**
 * One video as the API described it. `shorts` and `longForm` are the ids in
 * the two classification lists, or null when that list could not be read.
 */
export function toVideo(r: VideoResource, shorts: Set<string> | null, longForm: Set<string> | null): Video {
  let kind: VideoKind = 'unclassified';
  let kindEvidence = 'Not found in the channel’s Shorts list or its videos list';
  if (shorts?.has(r.id)) {
    kind = 'short';
    kindEvidence = 'Listed in the channel’s Shorts playlist';
  } else if (longForm?.has(r.id)) {
    kind = 'video';
    kindEvidence = 'Listed in the channel’s videos playlist';
  } else if (shorts === null && longForm === null) {
    kindEvidence = 'The channel’s Shorts and videos lists could not be read';
  }
  return {
    id: r.id,
    title: r.snippet?.title ?? '',
    description: r.snippet?.description ?? '',
    thumbnailUrl: thumbnail(r.snippet),
    publishedAt: r.snippet?.publishedAt ?? '',
    durationSeconds: parseDuration(r.contentDetails?.duration),
    // The watch link works for every video. A Short also opens from it.
    url: `https://www.youtube.com/watch?v=${r.id}`,
    kind,
    kindEvidence,
    views: count(r.statistics?.viewCount),
    likes: count(r.statistics?.likeCount),
    comments: count(r.statistics?.commentCount),
  };
}

/** Reads videos by id, 50 to a call. An id YouTube no longer returns is simply absent from the result. */
export async function fetchVideos(
  cfg: YouTubeConfig,
  fetcher: Fetcher,
  ids: string[],
  shorts: Set<string> | null,
  longForm: Set<string> | null,
  calls: { n: number }
): Promise<Video[]> {
  const out: Video[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const body = await get<{ items?: VideoResource[] }>(
      cfg,
      fetcher,
      'videos',
      { part: 'snippet,contentDetails,statistics', id: ids.slice(i, i + 50).join(','), maxResults: '50' },
      calls
    );
    for (const r of body.items ?? []) out.push(toVideo(r, shorts, longForm));
  }
  return out;
}

export type YouTubeRead = {
  channel: Channel;
  videos: Video[];
  /** Ids asked for that YouTube did not return: deleted or made private. */
  missing: string[];
  /** Units spent. Every call costs one. */
  quotaUnits: number;
  shortsListRead: boolean;
  videosListRead: boolean;
};

/**
 * One whole read of the channel: its videos published since `since`, plus
 * `alsoIds`, older videos to read again because they are linked into
 * content groups. The uploads list is the only thing that decides which
 * videos exist. The two classification lists only ever add a label.
 */
export async function readChannel(cfg: YouTubeConfig, fetcher: Fetcher, opts: { since: Date; alsoIds?: string[] }): Promise<YouTubeRead> {
  const calls = { n: 0 };
  const channel = await fetchChannel(cfg, fetcher, calls);
  const recent = (await fetchPlaylistVideoIds(cfg, fetcher, channel.uploadsPlaylist, calls, { since: opts.since })) ?? [];
  const tail = cfg.channelId.slice(2);
  const read = async (prefix: string) => {
    try {
      const ids = await fetchPlaylistVideoIds(cfg, fetcher, `${prefix}${tail}`, calls, { maxPages: 10 });
      return ids === null ? null : new Set(ids);
    } catch {
      // A classification list that fails costs a label, never the import.
      return null;
    }
  };
  const shorts = await read('UUSH');
  const longForm = await read('UULF');
  const ids = [...new Set([...recent, ...(opts.alsoIds ?? [])])];
  const videos = await fetchVideos(cfg, fetcher, ids, shorts, longForm, calls);
  const got = new Set(videos.map((v) => v.id));
  return { channel, videos, missing: ids.filter((id) => !got.has(id)), quotaUnits: calls.n, shortsListRead: shorts !== null, videosListRead: longForm !== null };
}
