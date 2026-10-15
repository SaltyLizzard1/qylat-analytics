import { sql } from '@/lib/db';
import { windowDateSql, type TimeWindow } from '@/lib/period';
import { decryptToken, encryptToken, tokenKey } from '@/lib/ytoken';
import { YT_ANALYTICS_SOURCE, type DailyRow, type TrafficRow } from '@/lib/ytanalytics';

/**
 * Everything YouTube Analytics keeps in the database. Server only.
 *
 * The refresh token goes in encrypted and comes out only through
 * loadRefreshToken, which the sync and the disconnect action call. Every
 * other read returns the connection without it, so no page can render it.
 */

/** Whether migration 015 has been applied. */
export async function hasAnalyticsTables(): Promise<boolean> {
  const rows = await sql`SELECT to_regclass('public.youtube_oauth') IS NOT NULL AS ok`;
  return rows[0]?.ok === true;
}

export type Connection = {
  channelId: string;
  channelTitle: string | null;
  scopes: string[];
  status: 'connected' | 'revoked' | 'failing';
  connectedAt: string;
  verifiedAt: string | null;
  revokedAt: string | null;
  lastError: string | null;
};

export async function getConnection(): Promise<Connection | null> {
  if (!(await hasAnalyticsTables())) return null;
  const rows = await sql`
    SELECT channel_id, channel_title, scopes, status, connected_at, verified_at, revoked_at, last_error
    FROM youtube_oauth WHERE id = 1`;
  const r = rows[0];
  if (!r) return null;
  return {
    channelId: r.channel_id as string,
    channelTitle: (r.channel_title as string | null) ?? null,
    scopes: String(r.scopes).split(' ').filter(Boolean),
    status: r.status as Connection['status'],
    connectedAt: r.connected_at as string,
    verifiedAt: (r.verified_at as string | null) ?? null,
    revokedAt: (r.revoked_at as string | null) ?? null,
    lastError: (r.last_error as string | null) ?? null,
  };
}

export async function saveConnection(c: { channelId: string; channelTitle: string; refreshToken: string; scopes: string[] }): Promise<void> {
  const enc = encryptToken(c.refreshToken, tokenKey());
  await sql`
    INSERT INTO youtube_oauth (id, channel_id, channel_title, refresh_token_enc, scopes, status, connected_at, verified_at, revoked_at, last_error, updated_at)
    VALUES (1, ${c.channelId}, ${c.channelTitle}, ${enc}, ${c.scopes.join(' ')}, 'connected', NOW(), NOW(), NULL, NULL, NOW())
    ON CONFLICT (id) DO UPDATE SET
      channel_id = EXCLUDED.channel_id, channel_title = EXCLUDED.channel_title,
      refresh_token_enc = EXCLUDED.refresh_token_enc, scopes = EXCLUDED.scopes,
      status = 'connected', connected_at = NOW(), verified_at = NOW(),
      revoked_at = NULL, last_error = NULL, updated_at = NOW()`;
}

/** The decrypted refresh token, or null when none is stored. For the sync and the disconnect only. */
export async function loadRefreshToken(): Promise<string | null> {
  const rows = await sql`SELECT refresh_token_enc FROM youtube_oauth WHERE id = 1`;
  const enc = rows[0]?.refresh_token_enc as string | null | undefined;
  return enc ? decryptToken(enc, tokenKey()) : null;
}

export async function markVerified(): Promise<void> {
  await sql`UPDATE youtube_oauth SET status = 'connected', verified_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = 1`;
}

/**
 * Google refused the grant. The token is useless from here, so it is
 * dropped; the analytics already stored stay until the 30 day rule below
 * removes them, or until the channel is reconnected and they are refreshed.
 */
export async function markRevoked(reason: string): Promise<void> {
  await sql`
    UPDATE youtube_oauth SET status = 'revoked', refresh_token_enc = NULL,
      revoked_at = COALESCE(revoked_at, NOW()), last_error = ${reason}, updated_at = NOW()
    WHERE id = 1`;
}

export async function markFailing(reason: string): Promise<void> {
  await sql`UPDATE youtube_oauth SET status = 'failing', last_error = ${reason}, updated_at = NOW() WHERE id = 1 AND status <> 'revoked'`;
}

/** Deletes the connection and every stored analytics row. Used by Disconnect. */
export async function deleteEverything(): Promise<{ daily: number; traffic: number }> {
  const d = await sql`DELETE FROM youtube_analytics_daily RETURNING day`;
  const t = await sql`DELETE FROM youtube_traffic_daily RETURNING day`;
  await sql`DELETE FROM youtube_analytics_runs`;
  await sql`DELETE FROM youtube_oauth`;
  return { daily: d.length, traffic: t.length };
}

/**
 * YouTube API Services Developer Policies, III.E.4.b: Analytics data may be
 * kept, but access must be confirmed at least every 30 days. When it has not
 * been confirmed for 30 days, the stored analytics are deleted. The
 * connection row stays, so the page can say what happened.
 */
export async function pruneUnconfirmed(): Promise<{ daily: number; traffic: number } | null> {
  const stale = await sql`
    SELECT 1 FROM youtube_oauth
    WHERE id = 1 AND COALESCE(verified_at, connected_at) < NOW() - INTERVAL '30 days'`;
  if (stale.length === 0) return null;
  const d = await sql`DELETE FROM youtube_analytics_daily RETURNING day`;
  const t = await sql`DELETE FROM youtube_traffic_daily RETURNING day`;
  return { daily: d.length, traffic: t.length };
}

export async function upsertDaily(rows: DailyRow[], channelId: string): Promise<void> {
  for (const r of rows) {
    await sql`
      INSERT INTO youtube_analytics_daily (day, views, estimated_minutes_watched, average_view_duration_seconds,
        average_view_percentage, subscribers_gained, subscribers_lost, channel_id, source, fetched_at)
      VALUES (${r.day}, ${r.views}, ${r.minutesWatched}, ${r.averageViewDuration}, ${r.averageViewPercentage},
        ${r.subscribersGained}, ${r.subscribersLost}, ${channelId}, ${YT_ANALYTICS_SOURCE}, NOW())
      ON CONFLICT (day) DO UPDATE SET
        views = EXCLUDED.views, estimated_minutes_watched = EXCLUDED.estimated_minutes_watched,
        average_view_duration_seconds = EXCLUDED.average_view_duration_seconds,
        average_view_percentage = EXCLUDED.average_view_percentage,
        subscribers_gained = EXCLUDED.subscribers_gained, subscribers_lost = EXCLUDED.subscribers_lost,
        channel_id = EXCLUDED.channel_id, source = EXCLUDED.source, fetched_at = NOW()`;
  }
}

/**
 * Replaces the traffic rows for each day YouTube returned. A source that was
 * reported on an earlier read and is not reported now is removed for that
 * day, because the newer read is the current one. Days YouTube returned
 * nothing for are left alone.
 */
export async function upsertTraffic(rows: TrafficRow[], channelId: string): Promise<void> {
  const days = [...new Set(rows.map((r) => r.day))];
  for (const day of days) {
    const keep = rows.filter((r) => r.day === day).map((r) => r.sourceType);
    await sql`DELETE FROM youtube_traffic_daily WHERE day = ${day} AND NOT (source_type = ANY(${keep}))`;
  }
  for (const r of rows) {
    await sql`
      INSERT INTO youtube_traffic_daily (day, source_type, views, estimated_minutes_watched, channel_id, source, fetched_at)
      VALUES (${r.day}, ${r.sourceType}, ${r.views}, ${r.minutesWatched}, ${channelId}, ${YT_ANALYTICS_SOURCE}, NOW())
      ON CONFLICT (day, source_type) DO UPDATE SET
        views = EXCLUDED.views, estimated_minutes_watched = EXCLUDED.estimated_minutes_watched,
        channel_id = EXCLUDED.channel_id, source = EXCLUDED.source, fetched_at = NOW()`;
  }
}

export async function recordRun(r: {
  startedAt: Date;
  ok: boolean;
  startDate: string | null;
  endDate: string | null;
  dataThrough: string | null;
  dailyRows: number | null;
  trafficRows: number | null;
  error: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO youtube_analytics_runs (started_at, finished_at, ok, start_date, end_date, data_through, daily_rows, traffic_rows, error)
    VALUES (${r.startedAt.toISOString()}, NOW(), ${r.ok}, ${r.startDate}, ${r.endDate}, ${r.dataThrough}, ${r.dailyRows}, ${r.trafficRows}, ${r.error})`;
}

/* ------------------------------------------------------------------ */
/* What the dashboard reads                                            */
/* ------------------------------------------------------------------ */

export type AnalyticsDay = {
  day: string;
  views: number | null;
  minutes: number | null;
  avgDuration: number | null;
  avgPercent: number | null;
  gained: number | null;
  lost: number | null;
};

export type WindowAnalytics = {
  connection: Connection | null;
  /** The last day YouTube had finished processing at the last successful read. */
  dataThrough: string | null;
  lastReadAt: string | null;
  lastRun: { at: string; ok: boolean; error: string | null } | null;
  days: AnalyticsDay[];
  traffic: { sourceType: string; views: number | null; minutes: number | null; days: number }[];
  /** Days in the window, up to dataThrough, for which a traffic source row exists. */
  trafficDays: number;
};

/** Stored analytics inside the window. Null when migration 015 is not applied. */
export async function getWindowAnalytics(w: TimeWindow): Promise<WindowAnalytics | null> {
  if (!(await hasAnalyticsTables())) return null;
  const connection = await getConnection();
  const runs = await sql`SELECT finished_at, ok, error FROM youtube_analytics_runs ORDER BY finished_at DESC LIMIT 1`;
  const good = await sql`SELECT data_through::text AS through, finished_at FROM youtube_analytics_runs WHERE ok ORDER BY finished_at DESC LIMIT 1`;
  const days = await sql(`
    SELECT day::text AS day, views, estimated_minutes_watched AS minutes,
           average_view_duration_seconds AS avg_duration, average_view_percentage AS avg_percent,
           subscribers_gained AS gained, subscribers_lost AS lost
    FROM youtube_analytics_daily WHERE TRUE ${windowDateSql(w, 'day')} ORDER BY day`);
  const traffic = await sql(`
    SELECT source_type, SUM(views) AS views, SUM(estimated_minutes_watched) AS minutes,
           COUNT(views)::int AS view_days, COUNT(estimated_minutes_watched)::int AS minute_days, COUNT(*)::int AS days
    FROM youtube_traffic_daily WHERE TRUE ${windowDateSql(w, 'day')}
    GROUP BY source_type ORDER BY SUM(views) DESC NULLS LAST`);
  const trafficDays = await sql(`SELECT COUNT(DISTINCT day)::int AS n FROM youtube_traffic_daily WHERE TRUE ${windowDateSql(w, 'day')}`);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    connection,
    dataThrough: (good[0]?.through as string | null) ?? null,
    lastReadAt: (good[0]?.finished_at as string | null) ?? null,
    lastRun: runs[0] ? { at: runs[0].finished_at as string, ok: runs[0].ok === true, error: (runs[0].error as string | null) ?? null } : null,
    days: days.map((r) => ({
      day: r.day as string,
      views: num(r.views),
      minutes: num(r.minutes),
      avgDuration: num(r.avg_duration),
      avgPercent: num(r.avg_percent),
      gained: num(r.gained),
      lost: num(r.lost),
    })),
    // A sum over days where some had no figure would read low. A source's
    // total is only given when every one of its rows has the figure.
    traffic: traffic.map((r) => ({
      sourceType: r.source_type as string,
      views: Number(r.view_days) === Number(r.days) ? num(r.views) : null,
      minutes: Number(r.minute_days) === Number(r.days) ? num(r.minutes) : null,
      days: Number(r.days),
    })),
    trafficDays: Number(trafficDays[0]?.n ?? 0),
  };
}
