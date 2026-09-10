import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { gaConfig, fetchUtmSessions, gaErrText, type GaConfig } from '@/lib/ga';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GA4 keeps revising the last day or two, so the daily job re-reads a window
 * and overwrites rather than appending yesterday once and trusting it.
 */
const DEFAULT_WINDOW_DAYS = 14;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

async function syncGa(cfg: GaConfig, days: number) {
  const rows = await fetchUtmSessions(cfg, days);

  const report = {
    fetched: rows.length,
    written: 0,
    errors: [] as { row: string; reason: string }[],
    matchedLinks: 0,
  };

  const knownSlugs = new Set(
    (await sql`SELECT slug FROM links`).map((r) => r.slug as string)
  );

  for (const row of rows) {
    try {
      await sql`
        INSERT INTO site_sessions (
          session_date, source, medium, campaign, content,
          sessions, engaged_sessions, active_users, key_events, synced_at
        )
        VALUES (
          ${row.date}::date, ${row.source}, ${row.medium}, ${row.campaign}, ${row.content},
          ${row.sessions}, ${row.engagedSessions}, ${row.activeUsers}, ${row.keyEvents}, NOW()
        )
        ON CONFLICT (session_date, source, medium, campaign, content) DO UPDATE SET
          sessions         = EXCLUDED.sessions,
          engaged_sessions = EXCLUDED.engaged_sessions,
          active_users     = EXCLUDED.active_users,
          key_events       = EXCLUDED.key_events,
          synced_at        = NOW()
      `;
      report.written += 1;
      if (knownSlugs.has(row.content)) report.matchedLinks += 1;
    } catch (e) {
      report.errors.push({
        row: `${row.date} ${row.source}/${row.medium}/${row.content}`,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return report;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized. Set CRON_SECRET and send it as a bearer token.' },
      { status: 401 }
    );
  }

  let cfg: GaConfig;
  try {
    cfg = gaConfig();
  } catch (e) {
    return NextResponse.json({ ok: false, error: gaErrText(e) }, { status: 500 });
  }

  const daysParam = Number(request.nextUrl.searchParams.get('days'));
  const days =
    Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : DEFAULT_WINDOW_DAYS;

  const startedAt = new Date();

  try {
    const result = await syncGa(cfg, days);
    return NextResponse.json({
      ok: result.errors.length === 0,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      windowDays: days,
      ...result,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        windowDays: days,
        error: gaErrText(e),
      },
      { status: 502 }
    );
  }
}
