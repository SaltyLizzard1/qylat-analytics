/**
 * YouTube Analytics through OAuth. Pure: no database, no environment reads
 * except through ytAnalyticsConfig, and every request through an injected
 * fetcher, so it is tested against recorded responses without a network.
 *
 * Permissions. Two read-only scopes and nothing else:
 *   yt-analytics.readonly  the Analytics reports
 *   youtube.readonly       Google's reference for reports.query says requests
 *                          "now require access to" this scope, and it also
 *                          names the channel the person authorized, which is
 *                          checked against YOUTUBE_CHANNEL_ID before anything
 *                          is stored.
 * Neither can change the channel, upload, comment or read revenue.
 *
 * Reports used, both from Google's "Channel reports" table:
 *   User activity by country for specific time periods, with dimension day
 *   and no country: views, estimatedMinutesWatched, averageViewDuration,
 *   averageViewPercentage, subscribersGained, subscribersLost. It is the only
 *   channel report that carries all six.
 *   Traffic source, dimensions insightTrafficSourceType and day: views and
 *   estimatedMinutesWatched. No traffic source report carries average view
 *   duration, percentage viewed or subscribers, so none is shown per source.
 *   The traffic source detail report (which site, which search term) does
 *   not take a day dimension and is not used.
 *
 * Delays and gaps, from Google's data model page: processing "typically
 * introduces a latency of 48 to 72 hours", and a day query "will not contain
 * rows for the most recent days". Some data "is limited when metrics do not
 * meet a certain threshold", which affects traffic sources among others, at
 * thresholds Google does not publish. So a day or a source with no row is
 * unknown, never zero, and a metric column that does not come back is NULL.
 */

export const YT_ANALYTICS_SCOPES = [
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtube.readonly',
] as const;

export const YT_ANALYTICS_SOURCE = 'youtube-analytics-api-v2';

export type YtAnalyticsConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  channelId: string;
  authBase: string;
  tokenUrl: string;
  revokeUrl: string;
  analyticsBase: string;
  dataBase: string;
};

export type Fetcher = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

/**
 * Reads the OAuth client and the channel from the environment. The *_BASE and
 * *_URL overrides exist for tests, which point them at a local stand-in.
 */
export function ytAnalyticsConfig(env: Record<string, string | undefined>): YtAnalyticsConfig {
  const need = (name: string) => {
    const v = env[name];
    if (!v) throw new Error(`${name} is not set`);
    return v;
  };
  const channelId = need('YOUTUBE_CHANNEL_ID');
  if (!/^UC[\w-]{22}$/.test(channelId)) throw new Error('YOUTUBE_CHANNEL_ID is not a channel id');
  return {
    clientId: need('GOOGLE_OAUTH_CLIENT_ID'),
    clientSecret: need('GOOGLE_OAUTH_CLIENT_SECRET'),
    redirectUri: need('YOUTUBE_OAUTH_REDIRECT_URI'),
    channelId,
    authBase: env.GOOGLE_OAUTH_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: env.GOOGLE_OAUTH_TOKEN_URL || 'https://oauth2.googleapis.com/token',
    revokeUrl: env.GOOGLE_OAUTH_REVOKE_URL || 'https://oauth2.googleapis.com/revoke',
    analyticsBase: env.YOUTUBE_ANALYTICS_BASE || 'https://youtubeanalytics.googleapis.com/v2',
    dataBase: env.YOUTUBE_API_BASE || 'https://www.googleapis.com/youtube/v3',
  };
}

/** Google said the grant is gone: revoked, expired, or the Testing week is up. Reconnect. */
export class GrantRevokedError extends Error {}

/** Anything else that went wrong. Its message is Google's reason and never carries a token. */
export class YtAnalyticsError extends Error {
  status: number;
  reason: string;
  constructor(status: number, reason: string, message: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

/** The address the browser is sent to for consent. Offline, so Google issues a refresh token. */
export function authUrl(cfg: YtAnalyticsConfig, state: string, challenge: string): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: YT_ANALYTICS_SCOPES.join(' '),
    access_type: 'offline',
    // Consent every time, so a reconnect always returns a new refresh token.
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${cfg.authBase}?${q.toString()}`;
}

type TokenBody = { access_token?: string; refresh_token?: string; scope?: string; error?: string; error_description?: string };

async function tokenRequest(cfg: YtAnalyticsConfig, fetcher: Fetcher, form: Record<string, string>): Promise<TokenBody> {
  const res = await fetcher(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...form }).toString(),
  });
  let body: TokenBody = {};
  try {
    body = (await res.json()) as TokenBody;
  } catch {
    // Not JSON: the status is all there is.
  }
  if (!res.ok) {
    // invalid_grant is Google's answer for a revoked, expired or unknown grant.
    if (body.error === 'invalid_grant') throw new GrantRevokedError(`Google refused the stored grant: ${body.error_description ?? 'invalid_grant'}`);
    throw new YtAnalyticsError(res.status, body.error ?? 'unknown', `Google token endpoint: ${body.error_description ?? body.error ?? `HTTP ${res.status}`}`);
  }
  return body;
}

export async function exchangeCode(
  cfg: YtAnalyticsConfig,
  fetcher: Fetcher,
  code: string,
  verifier: string
): Promise<{ accessToken: string; refreshToken: string | null; scopes: string[] }> {
  const body = await tokenRequest(cfg, fetcher, { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: cfg.redirectUri });
  if (!body.access_token) throw new YtAnalyticsError(502, 'no_access_token', 'Google returned no access token');
  return { accessToken: body.access_token, refreshToken: body.refresh_token ?? null, scopes: (body.scope ?? '').split(' ').filter(Boolean) };
}

export async function refreshAccess(cfg: YtAnalyticsConfig, fetcher: Fetcher, refreshToken: string): Promise<string> {
  const body = await tokenRequest(cfg, fetcher, { grant_type: 'refresh_token', refresh_token: refreshToken });
  if (!body.access_token) throw new YtAnalyticsError(502, 'no_access_token', 'Google returned no access token');
  return body.access_token;
}

/** Revokes a token at Google. Returns whether Google accepted, never throws. */
export async function revokeToken(cfg: YtAnalyticsConfig, fetcher: Fetcher, token: string): Promise<boolean> {
  try {
    const res = await fetcher(cfg.revokeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function getJson<T>(fetcher: Fetcher, url: string, accessToken: string, what: string): Promise<T> {
  const res = await fetcher(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    let reason = 'unknown';
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[]; status?: string } };
      reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? reason;
      message = body.error?.message ?? message;
    } catch {
      // Not JSON.
    }
    // A 401 here, with a fresh access token, means the grant went away mid-run.
    if (res.status === 401) throw new GrantRevokedError(`${what}: ${message}`);
    throw new YtAnalyticsError(res.status, reason, `${what}: ${message} (${reason})`);
  }
  return (await res.json()) as T;
}

/** The channel the signed-in person authorized, through youtube.readonly. */
export async function authorizedChannel(cfg: YtAnalyticsConfig, fetcher: Fetcher, accessToken: string): Promise<{ id: string; title: string } | null> {
  const q = new URLSearchParams({ part: 'id,snippet', mine: 'true' });
  const body = await getJson<{ items?: { id: string; snippet?: { title?: string } }[] }>(fetcher, `${cfg.dataBase}/channels?${q}`, accessToken, 'YouTube channels');
  const c = body.items?.[0];
  return c ? { id: c.id, title: c.snippet?.title ?? '' } : null;
}

type ReportBody = { columnHeaders?: { name: string }[]; rows?: unknown[][] };

/**
 * One reports.query call. Rows come back keyed by column name, read from the
 * response's own headers rather than assumed from the order asked for. A
 * column that did not come back is absent from the record, and the callers
 * turn absent into NULL.
 */
export async function report(
  cfg: YtAnalyticsConfig,
  fetcher: Fetcher,
  accessToken: string,
  params: { startDate: string; endDate: string; metrics: string[]; dimensions: string[]; sort?: string }
): Promise<Record<string, unknown>[]> {
  const q = new URLSearchParams({
    ids: `channel==${cfg.channelId}`,
    startDate: params.startDate,
    endDate: params.endDate,
    metrics: params.metrics.join(','),
    dimensions: params.dimensions.join(','),
    ...(params.sort ? { sort: params.sort } : {}),
  });
  const body = await getJson<ReportBody>(fetcher, `${cfg.analyticsBase}/reports?${q}`, accessToken, 'YouTube Analytics');
  const names = (body.columnHeaders ?? []).map((h) => h.name);
  return (body.rows ?? []).map((r) => Object.fromEntries(names.map((n, i) => [n, r[i]])));
}

/** A number from a report cell. Anything else, including a missing cell, is unknown. */
export function cell(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export type DailyRow = {
  day: string;
  views: number | null;
  minutesWatched: number | null;
  averageViewDuration: number | null;
  averageViewPercentage: number | null;
  subscribersGained: number | null;
  subscribersLost: number | null;
};

export type TrafficRow = { day: string; sourceType: string; views: number | null; minutesWatched: number | null };

const DAILY_METRICS = ['views', 'estimatedMinutesWatched', 'averageViewDuration', 'averageViewPercentage', 'subscribersGained', 'subscribersLost'];

export async function readDaily(cfg: YtAnalyticsConfig, fetcher: Fetcher, accessToken: string, startDate: string, endDate: string): Promise<DailyRow[]> {
  const rows = await report(cfg, fetcher, accessToken, { startDate, endDate, metrics: DAILY_METRICS, dimensions: ['day'], sort: 'day' });
  return rows
    .filter((r) => typeof r.day === 'string')
    .map((r) => ({
      day: r.day as string,
      views: cell(r.views),
      minutesWatched: cell(r.estimatedMinutesWatched),
      averageViewDuration: cell(r.averageViewDuration),
      averageViewPercentage: cell(r.averageViewPercentage),
      subscribersGained: cell(r.subscribersGained),
      subscribersLost: cell(r.subscribersLost),
    }));
}

export async function readTraffic(cfg: YtAnalyticsConfig, fetcher: Fetcher, accessToken: string, startDate: string, endDate: string): Promise<TrafficRow[]> {
  const rows = await report(cfg, fetcher, accessToken, {
    startDate,
    endDate,
    metrics: ['views', 'estimatedMinutesWatched'],
    dimensions: ['day', 'insightTrafficSourceType'],
    sort: 'day',
  });
  return rows
    .filter((r) => typeof r.day === 'string' && typeof r.insightTrafficSourceType === 'string')
    .map((r) => ({ day: r.day as string, sourceType: r.insightTrafficSourceType as string, views: cell(r.views), minutesWatched: cell(r.estimatedMinutesWatched) }));
}

/** Plain names for Google's traffic source values, from the API's dimensions reference. */
export const TRAFFIC_SOURCE_LABEL: Record<string, string> = {
  ADVERTISING: 'YouTube ads',
  ANNOTATION: 'Annotations',
  CAMPAIGN_CARD: 'Campaign cards',
  END_SCREEN: 'End screens',
  EXT_URL: 'External sites and Google Search',
  HASHTAGS: 'Hashtag pages',
  LIVE_REDIRECT: 'Live redirects',
  NO_LINK_EMBEDDED: 'Embedded, no referrer',
  NO_LINK_OTHER: 'Direct or unknown',
  NOTIFICATION: 'Notifications',
  PLAYLIST: 'Playlists',
  PRODUCT_PAGE: 'Product pages',
  PROMOTED: 'Unpaid YouTube promotion',
  RELATED_VIDEO: 'Suggested videos',
  SHORTS: 'Shorts feed',
  SOUND_PAGE: 'Shorts sound pages',
  SUBSCRIBER: 'Home and subscription feeds',
  YT_CHANNEL: 'Channel pages',
  YT_OTHER_PAGE: 'Other YouTube pages',
  YT_SEARCH: 'YouTube search',
  VIDEO_REMIXES: 'Remixes',
  WATCH_WITH: 'Watch With streams',
};

export function trafficLabel(type: string): string {
  return TRAFFIC_SOURCE_LABEL[type] ?? type;
}
