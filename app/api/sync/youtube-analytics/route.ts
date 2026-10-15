import { NextRequest, NextResponse } from 'next/server';
import {
  GrantRevokedError,
  readDaily,
  readTraffic,
  refreshAccess,
  ytAnalyticsConfig,
  type Fetcher,
} from '@/lib/ytanalytics';
import {
  getConnection,
  hasAnalyticsTables,
  loadRefreshToken,
  markFailing,
  markRevoked,
  markVerified,
  pruneUnconfirmed,
  recordRun,
  upsertDaily,
  upsertTraffic,
} from '@/lib/ytanalytics-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Reads YouTube Analytics for the connected channel and stores it.
 *
 *   GET /api/sync/youtube-analytics           the last 35 days
 *   GET /api/sync/youtube-analytics?days=365  a backfill
 *
 * Re-reading a window is on purpose: YouTube finishes processing a day 48 to
 * 72 hours late and can revise it, so every run overwrites the days it gets
 * back. Each day is one row, so a rerun never duplicates. Days YouTube has
 * not finished are simply not returned, and nothing is written for them.
 *
 * Its own route and its own invocation, apart from /api/sync/meta and
 * /api/sync/youtube. Guarded by CRON_SECRET. Not on a schedule.
 *
 * Nothing in the response carries a token. Errors carry Google's reason.
 */
const DEFAULT_DAYS = 35;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized. Set CRON_SECRET and send it as a bearer token.' }, { status: 401 });
  }
  if (!(await hasAnalyticsTables())) {
    return NextResponse.json({ ok: false, error: 'Migration 015 has not been applied. Nothing was read or written.' }, { status: 409 });
  }
  const startedAt = new Date();

  // The 30 day rule runs first, whatever happens next.
  const pruned = await pruneUnconfirmed();

  const connection = await getConnection();
  if (!connection) {
    return NextResponse.json({ ok: false, error: 'YouTube Analytics is not connected. Connect it from /admin/youtube.', pruned }, { status: 409 });
  }
  if (connection.status === 'revoked') {
    return NextResponse.json({ ok: false, error: 'Access was revoked. Reconnect from /admin/youtube.', revokedAt: connection.revokedAt, pruned }, { status: 409 });
  }

  const daysParam = Number(request.nextUrl.searchParams.get('days'));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(Math.floor(daysParam), 400) : DEFAULT_DAYS;
  const endDate = startedAt.toISOString().slice(0, 10);
  const startDate = new Date(startedAt.getTime() - days * 86_400_000).toISOString().slice(0, 10);

  const cfg = ytAnalyticsConfig(process.env);
  const fetcher: Fetcher = (url, init) => fetch(url, { ...init, cache: 'no-store' });
  const fail = async (status: number, error: string, revoked: boolean) => {
    if (revoked) await markRevoked(error);
    else await markFailing(error);
    await recordRun({ startedAt, ok: false, startDate, endDate, dataThrough: null, dailyRows: null, trafficRows: null, error });
    return NextResponse.json({ ok: false, error, revoked, pruned }, { status });
  };

  try {
    const refresh = await loadRefreshToken();
    if (!refresh) return await fail(409, 'No refresh token is stored. Reconnect from /admin/youtube.', true);
    const access = await refreshAccess(cfg, fetcher, refresh);
    const daily = await readDaily(cfg, fetcher, access, startDate, endDate);
    const traffic = await readTraffic(cfg, fetcher, access, startDate, endDate);
    await upsertDaily(daily, cfg.channelId);
    await upsertTraffic(traffic, cfg.channelId);
    await markVerified();
    const dataThrough = daily.map((d) => d.day).sort().at(-1) ?? null;
    await recordRun({ startedAt, ok: true, startDate, endDate, dataThrough, dailyRows: daily.length, trafficRows: traffic.length, error: null });
    const missing = (k: keyof (typeof daily)[number]) => daily.filter((d) => d[k] === null).length;
    return NextResponse.json({
      ok: true,
      startDate,
      endDate,
      dataThrough,
      dailyRows: daily.length,
      trafficRows: traffic.length,
      trafficSources: [...new Set(traffic.map((t) => t.sourceType))].sort(),
      missingMetrics: {
        views: missing('views'),
        minutesWatched: missing('minutesWatched'),
        averageViewDuration: missing('averageViewDuration'),
        averageViewPercentage: missing('averageViewPercentage'),
        subscribersGained: missing('subscribersGained'),
        subscribersLost: missing('subscribersLost'),
      },
      pruned,
    });
  } catch (e) {
    if (e instanceof GrantRevokedError) return await fail(409, e.message, true);
    return await fail(502, e instanceof Error ? e.message : 'YouTube Analytics could not be read', false);
  }
}
