import { revalidateTag, unstable_cache } from 'next/cache';
import { sql } from '@/lib/db';

/**
 * On demand runs of the personal profile scraper.
 *
 * The scraper runs only on the laptop, so the dashboard cannot start it, and
 * nothing on the laptop runs in the background waiting to be asked. Instead
 * the Sync page writes a request and then opens a qylat-collect: link. Windows
 * hands that link to scripts/personal-fb/collect.py, which claims the request,
 * runs the scraper and reports the exit code.
 *
 * The request is what makes the link safe. Any web page can open a
 * qylat-collect: link, but collect.py runs the scraper only when it can claim
 * a request, and only a press on this logged in Sync page writes one. A link
 * opened from anywhere else finds nothing to claim and does nothing.
 *
 * Whether a request is open is cached and the cache is cleared by every
 * write, so a claim with nothing waiting does not wake Neon. The database,
 * not the cache, decides what is claimed.
 */

/** A request the collector did not claim in this time is withdrawn. The link
 *  opens within seconds of the press, so a request older than this was pressed
 *  somewhere the collector is not set up, and must not stay claimable. */
export const PENDING_EXPIRES_MIN = 5;
/** A claimed run that has not reported back in this time is marked expired.
 *  collect.py stops the scraper after 20 minutes. */
export const RUNNING_EXPIRES_MIN = 30;

const TAG = 'profile-run';

export type RunRequest = {
  id: number;
  state: 'pending' | 'running' | 'finished' | 'expired';
  requested_at: string;
  claimed_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  detail: string | null;
};

/** What each scraper exit code means, from scripts/personal-fb/README.md. */
export const EXIT_MEANING: Record<number, string> = {
  0: 'Collection stored, or the dashboard already had it.',
  1: 'Unexpected failure. The traceback is in scrape.log on the laptop.',
  2: 'INGEST_URL or PERSONAL_INGEST_SECRET is missing on the laptop.',
  3: 'No saved session on the laptop.',
  4: 'Facebook did not load or showed no posts.',
  5: 'Facebook showed a login form or a checkpoint. Run scrape.py --setup on the laptop before collecting again.',
  6: 'No source could be read. Nothing was stored.',
  7: 'The dashboard did not store the collection. Run scrape.py --resend on the laptop.',
  8: 'Publish times disagreed with the timezone. Nothing was stored.',
};

/**
 * Withdraws stale requests. Every read and write calls this first. A page
 * render may not clear the cache, so it passes false; a cache left saying
 * "open" only costs the collector one database read, which then clears it.
 */
async function expireStale(clearCache = true): Promise<void> {
  const expired = await sql`
    UPDATE profile_run_requests
    SET state = 'expired', finished_at = NOW()
    WHERE (state = 'pending' AND requested_at < NOW() - make_interval(mins => ${PENDING_EXPIRES_MIN}::int))
       OR (state = 'running' AND claimed_at < NOW() - make_interval(mins => ${RUNNING_EXPIRES_MIN}::int))
    RETURNING id
  `;
  if (clearCache && expired.length > 0) revalidateTag(TAG, { expire: 0 });
}

const openInCache = unstable_cache(
  async () => {
    const rows = await sql`SELECT 1 FROM profile_run_requests WHERE state IN ('pending', 'running') LIMIT 1`;
    return rows.length > 0;
  },
  ['profile-run-open'],
  { tags: [TAG] }
);

export async function latestRunRequest(): Promise<RunRequest | null> {
  await expireStale(false);
  const rows = await sql`
    SELECT id, state, requested_at, claimed_at, finished_at, exit_code, detail
    FROM profile_run_requests ORDER BY requested_at DESC LIMIT 1
  `;
  return (rows[0] as RunRequest | undefined) ?? null;
}

/** Null when a request is already open. The unique index decides, so two
 *  presses at the same moment still open only one. */
export async function openRunRequest(): Promise<RunRequest | null> {
  await expireStale();
  const rows = await sql`
    INSERT INTO profile_run_requests DEFAULT VALUES
    ON CONFLICT DO NOTHING
    RETURNING id, state, requested_at, claimed_at, finished_at, exit_code, detail
  `;
  revalidateTag(TAG, { expire: 0 });
  return (rows[0] as RunRequest | undefined) ?? null;
}

/** The collector's question. Returns the request it now owns, or null. */
export async function claimRunRequest(): Promise<{ id: number } | null> {
  if (!(await openInCache())) return null;
  await expireStale();
  // Only one row can be pending. A second claim at the same moment re-checks
  // the state after the first commits and updates nothing.
  const rows = await sql`
    UPDATE profile_run_requests
    SET state = 'running', claimed_at = NOW()
    WHERE state = 'pending'
    RETURNING id
  `;
  if (rows.length === 0) {
    // Running or expired: either way there is nothing to hand out, and the
    // cache may have been stale.
    revalidateTag(TAG, { expire: 0 });
    return null;
  }
  return { id: Number(rows[0].id) };
}

/**
 * Records the result of a claimed run. A run that overran and was marked
 * expired still gets its result recorded, because the scraper did finish.
 */
export async function finishRunRequest(id: number, exitCode: number, detail: string): Promise<boolean> {
  const rows = await sql`
    UPDATE profile_run_requests
    SET state = 'finished', finished_at = NOW(), exit_code = ${exitCode}, detail = ${detail}
    WHERE id = ${id} AND claimed_at IS NOT NULL AND state IN ('running', 'expired')
    RETURNING id
  `;
  revalidateTag(TAG, { expire: 0 });
  return rows.length > 0;
}
