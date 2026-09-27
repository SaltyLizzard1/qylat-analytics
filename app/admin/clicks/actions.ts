'use server';

import { sql } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export type ClickActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success'; message: string };

/**
 * Nothing in this file deletes or rewrites a raw click.
 *
 * Marking a click as a test sets a flag beside the row. Reclassifying
 * recomputes a derived column from the stored user agent. The referrer, the
 * user agent, the country, the cookie and the timestamp are never touched, so
 * any classification decision can be revisited later against the same evidence.
 */

function revalidate() {
  revalidatePath('/admin/clicks');
  revalidatePath('/admin/links');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/funnel');
  revalidatePath('/dashboard/platforms');
  revalidatePath('/dashboard/themes');
  revalidatePath('/dashboard/ctas');
  revalidatePath('/dashboard/leaderboard');
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Mark or unmark a single click as Liz's own test. */
export async function setClickIsTest(
  _prev: ClickActionState,
  formData: FormData
): Promise<ClickActionState> {
  const id = String(formData.get('id') ?? '').trim();
  const next = String(formData.get('next') ?? '') === 'true';

  if (!id) {
    return { status: 'error', message: 'No click id given.' };
  }

  try {
    const rows = await sql`
      UPDATE click_events SET is_test = ${next}
      WHERE id = ${id}
      RETURNING id
    `;
    if (rows.length === 0) {
      return { status: 'error', message: `No click with id ${id}. Nothing changed.` };
    }
    revalidate();
    return {
      status: 'success',
      message: next ? 'Marked as a test click.' : 'No longer marked as a test.',
    };
  } catch (e) {
    console.error(`[set-click-is-test-failed] id=${id} next=${next} error=${errText(e)}`);
    return { status: 'error', message: `Could not update click ${id}: ${errText(e)}` };
  }
}

/**
 * Mark every click from one browser as Liz's own.
 *
 * The session cookie is the field that actually identifies a browser across
 * days, which is how the two Aug 23 test hits and a later hit from the same
 * machine were recognised as one person. Marking by cookie rather than row
 * means a test session does not have to be picked apart click by click, and
 * the insert trigger carries the flag forward to future hits from that browser.
 */
export async function setSessionIsTest(
  _prev: ClickActionState,
  formData: FormData
): Promise<ClickActionState> {
  const sessionId = String(formData.get('sessionId') ?? '').trim();
  const next = String(formData.get('next') ?? '') === 'true';

  if (!sessionId) {
    return { status: 'error', message: 'No session id given.' };
  }

  try {
    const rows = await sql`
      UPDATE click_events SET is_test = ${next}
      WHERE session_id = ${sessionId}
      RETURNING id
    `;
    if (rows.length === 0) {
      return {
        status: 'error',
        message: `No clicks found for that browser. Nothing changed.`,
      };
    }
    revalidate();
    const n = rows.length;
    return {
      status: 'success',
      message: next
        ? `Marked ${n} ${n === 1 ? 'click' : 'clicks'} from this browser as tests. Future clicks from it are marked automatically.`
        : `Unmarked ${n} ${n === 1 ? 'click' : 'clicks'} from this browser.`,
    };
  } catch (e) {
    console.error(
      `[set-session-is-test-failed] session=${sessionId} next=${next} error=${errText(e)}`
    );
    return { status: 'error', message: `Could not update that browser: ${errText(e)}` };
  }
}

/**
 * Recompute classification for every click from the stored user agent.
 *
 * This is the whole point of storing the raw user agent. When the rules change,
 * history is rejudged by the same rules as new rows instead of the totals
 * quietly splitting into a before and an after. The rules version is stamped
 * onto every row it touches, and the Links and Click Log pages show the date,
 * so a figure that moves always has a reason on the same screen.
 */
export async function reclassifyClicks(
  _prev: ClickActionState,
  _formData: FormData
): Promise<ClickActionState> {
  try {
    const before = await sql`
      SELECT
        COUNT(*) FILTER (WHERE NOT is_test AND classification = 'human')::int     AS human,
        COUNT(*) FILTER (WHERE NOT is_test AND classification = 'uncertain')::int AS uncertain,
        COUNT(*) FILTER (WHERE NOT is_test AND classification = 'crawler')::int   AS crawler
      FROM click_events
    `;

    const updated = await sql`
      UPDATE click_events
      SET classification = classify_click(user_agent, referrer),
          rules_version  = classification_rules_version()
      RETURNING id
    `;

    const after = await sql`
      SELECT
        COUNT(*) FILTER (WHERE NOT is_test AND classification = 'human')::int     AS human,
        COUNT(*) FILTER (WHERE NOT is_test AND classification = 'uncertain')::int AS uncertain,
        COUNT(*) FILTER (WHERE NOT is_test AND classification = 'crawler')::int   AS crawler
      FROM click_events
    `;

    const b = before[0] ?? {};
    const a = after[0] ?? {};
    const moved =
      (b.human as number) !== (a.human as number) ||
      (b.uncertain as number) !== (a.uncertain as number) ||
      (b.crawler as number) !== (a.crawler as number);

    revalidate();

    const summary = `${updated.length} ${updated.length === 1 ? 'row' : 'rows'} rejudged. People ${b.human} to ${a.human}, uncertain ${b.uncertain} to ${a.uncertain}, crawlers ${b.crawler} to ${a.crawler}.`;

    return {
      status: 'success',
      message: moved ? summary : `${summary} No figure changed.`,
    };
  } catch (e) {
    console.error(`[reclassify-clicks-failed] error=${errText(e)}`);
    return {
      status: 'error',
      message: `Reclassify failed, nothing was changed: ${errText(e)}`,
    };
  }
}
