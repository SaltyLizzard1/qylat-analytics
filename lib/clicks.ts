import { sql } from '@/lib/db';

/**
 * Click classification, in one place.
 *
 * The classifier itself is NOT here. It lives in the database as
 * classify_click(user_agent, referrer), created by
 * db/migrations/008_click_classification.sql, and is called both by the insert
 * trigger and by reclassifyClicks below.
 *
 * That is deliberate. The previous design kept the rule list in lib/bots.ts and
 * a second copy inlined in migration 005, and they drifted the moment a token
 * was added to one and not the other. A rule that lives in two places is a rule
 * that will eventually give two answers to the same row.
 *
 * What lives here is everything above the rule: the names of the states, the
 * failure recorder, and the queries the pages read.
 */

export type Classification = 'human' | 'uncertain' | 'crawler';

/** Every state ships with words. Nothing on screen is carried by colour alone. */
export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  human: 'Person',
  uncertain: 'Uncertain',
  crawler: 'Crawler',
};

export const CLASSIFICATION_SHORT: Record<Classification, string> = {
  human: 'Person',
  uncertain: 'Uncertain',
  crawler: 'Crawler',
};

/** Why a row got the state it did, shown on hover in the Click Log. */
export const CLASSIFICATION_REASON: Record<Classification, string> = {
  human:
    'The user agent carries an in app browser token, or is an ordinary browser that did not arrive from a Meta domain.',
  uncertain:
    'An ordinary browser arriving from facebook.com or instagram.com. Meta fetches links with plain browser user agents from those domains, and so does a person on desktop web. Not counted, not discarded.',
  crawler:
    'A self declared crawler or link preview fetcher, a missing user agent, or the pinned Chrome/74.0.3729.131 string Meta fetches with.',
};

export type ClickCounts = {
  human: number;
  uncertain: number;
  crawler: number;
  test: number;
  total: number;
};

const ZERO: ClickCounts = { human: 0, uncertain: 0, crawler: 0, test: 0, total: 0 };

function toCounts(row: Record<string, unknown> | undefined): ClickCounts {
  if (!row) return ZERO;
  return {
    human: (row.human as number) ?? 0,
    uncertain: (row.uncertain as number) ?? 0,
    crawler: (row.crawler as number) ?? 0,
    test: (row.test as number) ?? 0,
    total: (row.total as number) ?? 0,
  };
}

/**
 * Records a click that could not be stored.
 *
 * Never throws and never rethrows. This is called from the redirect path, and
 * a person clicking a link must reach the destination whatever the database is
 * doing. But the failure is never swallowed either: it goes to the console as
 * a single greppable line with slug, timestamp and error, and it is written to
 * click_failures so the Click Log can show it. If that write also fails, which
 * it will when the database is the thing that is down, the second failure is
 * logged too rather than being caught and dropped.
 */
export async function recordClickFailure(input: {
  slug: string | null;
  path: string;
  reason: 'insert_failed' | 'unknown_slug' | 'malformed_path' | 'lookup_failed';
  detail: string;
}): Promise<void> {
  const at = new Date().toISOString();

  console.error(
    `[click-failure] reason=${input.reason} slug=${input.slug ?? '(none)'} ` +
      `path=${input.path} at=${at} detail=${input.detail}`
  );

  try {
    await sql`
      INSERT INTO click_failures (slug, path, reason, detail)
      VALUES (${input.slug}, ${input.path}, ${input.reason}, ${input.detail})
    `;
  } catch (e) {
    console.error(
      `[click-failure-unrecordable] could not write click_failures at=${at} ` +
        `originalReason=${input.reason} originalSlug=${input.slug ?? '(none)'} ` +
        `error=${e instanceof Error ? e.message : String(e)}`
    );
  }
}

/** Counts by state for one slug. Mutually exclusive, and they sum to total. */
export async function getClickCountsBySlug(): Promise<Map<string, ClickCounts>> {
  const rows = await sql`
    SELECT slug, human, uncertain, crawler, test, total FROM click_counts
  `;
  const out = new Map<string, ClickCounts>();
  for (const row of rows) out.set(row.slug as string, toCounts(row));
  return out;
}

/** Counts by state across every slug. */
export async function getClickCountsTotal(): Promise<ClickCounts> {
  const rows = await sql`
    SELECT
      COALESCE(SUM(human), 0)::int     AS human,
      COALESCE(SUM(uncertain), 0)::int AS uncertain,
      COALESCE(SUM(crawler), 0)::int   AS crawler,
      COALESCE(SUM(test), 0)::int      AS test,
      COALESCE(SUM(total), 0)::int     AS total
    FROM click_counts
  `;
  return toCounts(rows[0]);
}

export type RulesVersion = { version: number; changedOn: string; note: string };

/**
 * The current rules version and the date it changed.
 *
 * Shown on the Links page and the Click Log. Migration 005 rewrote the 16 Sept
 * totals on 19 Sept with nothing on screen to explain why the numbers moved.
 * This is the fix for that: if a figure shifts, the date it shifted is on the
 * same page as the figure.
 */
export async function getRulesVersion(): Promise<RulesVersion | null> {
  const rows = await sql`
    SELECT version, changed_on, note
    FROM classification_rules
    ORDER BY version DESC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    version: row.version as number,
    changedOn: row.changed_on as string,
    note: row.note as string,
  };
}

/**
 * Rows still carrying an older rules version than the current one.
 *
 * Non zero means history and new rows were judged by different rules, which is
 * exactly the state migration 005 left behind. The Click Log says so and
 * offers the reclassify action.
 */
export async function getStaleRowCount(): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*)::int AS n
    FROM click_events
    WHERE rules_version <> classification_rules_version()
  `;
  return (rows[0]?.n as number) ?? 0;
}

export type ClickFailure = {
  id: string;
  failedAt: string;
  slug: string | null;
  path: string | null;
  reason: string;
  detail: string | null;
};

export async function getRecentFailures(limit = 20): Promise<ClickFailure[]> {
  const rows = await sql`
    SELECT id, failed_at, slug, path, reason, detail
    FROM click_failures
    ORDER BY failed_at DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: String(row.id),
    failedAt: row.failed_at as string,
    slug: (row.slug as string | null) ?? null,
    path: (row.path as string | null) ?? null,
    reason: row.reason as string,
    detail: (row.detail as string | null) ?? null,
  }));
}

export async function getFailureCount(): Promise<number> {
  const rows = await sql`SELECT COUNT(*)::int AS n FROM click_failures`;
  return (rows[0]?.n as number) ?? 0;
}
