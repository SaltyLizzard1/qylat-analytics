import { sql } from '@/lib/db';
import { windowDateExpr, type TimeWindow } from '@/lib/period';
import { full, longDate, platformLabel } from '@/lib/theme';

/**
 * The one rule for a follower history that opens on a total nobody can
 * confirm. Overview, Audience and Growth all read it from here, so the three
 * pages cannot disagree about the same account.
 *
 * The case it was written for: the Facebook Page's first stored total is 0,
 * read from the API on 10 Sept 2026. The next read, on the morning of the
 * 11th, returned 6 (commit d035897 records both). Whether the Page truly had
 * no followers that afternoon or the API had not caught up cannot be
 * established from what is stored.
 *
 * What the rule does:
 *   - An account's first stored total being 0 is an uncertain baseline. The
 *     row stays in the table exactly as it was written. Nothing here edits a
 *     record.
 *   - It is never drawn as a point and never used as a starting figure. A
 *     change is counted between recorded totals from the next one on, and is
 *     labelled with the total and date it starts from.
 *   - The platform's own reported daily gains are a different measurement
 *     from the totals and are never rewritten to match them. Where they are
 *     shown and the window takes in the step up from the uncertain reading,
 *     they are labelled as reported by the platform and that step is
 *     disclosed.
 *   - A window that takes in neither the uncertain reading nor the step up
 *     from it is untouched.
 */

export type Total = { recorded_on: string; followers: number };

export type UncertainBaseline = {
  platform: string;
  /** The date of the first stored total, which is 0. */
  recorded_on: string;
  /** The first total stored after it, if there is one. */
  next: Total | null;
  /**
   * What the platform reported as new followers for the days after the
   * uncertain reading up to and including `next`: the step up from it.
   * Null when the platform reported nothing for those days.
   */
  openingGain: number | null;
};

/** Follower totals inside a window, oldest first, exactly as stored. */
export async function getFollowerTotals(platform: string, w: TimeWindow): Promise<Total[]> {
  const rows = await sql(
    `SELECT recorded_on::text AS recorded_on, followers FROM audience_snapshots
     WHERE platform = $1 AND followers IS NOT NULL AND ${windowDateExpr(w, 'recorded_on')} ORDER BY recorded_on`,
    [platform]
  );
  return rows.map((r) => ({ recorded_on: r.recorded_on as string, followers: Number(r.followers) }));
}

/** The account's uncertain opening total, or null when its history opens on a real figure. */
export async function getUncertainBaseline(platform: string): Promise<UncertainBaseline | null> {
  const first = await sql(
    `SELECT recorded_on::text AS recorded_on, followers FROM audience_snapshots
     WHERE platform = $1 AND followers IS NOT NULL ORDER BY recorded_on LIMIT 2`,
    [platform]
  );
  if (!first[0] || Number(first[0].followers) !== 0) return null;
  const recorded_on = first[0].recorded_on as string;
  const next: Total | null = first[1]
    ? { recorded_on: first[1].recorded_on as string, followers: Number(first[1].followers) }
    : null;
  let openingGain: number | null = null;
  if (next) {
    const g = await sql(
      `SELECT SUM(new_followers)::int AS gained, COUNT(new_followers)::int AS days FROM audience_snapshots
       WHERE platform = $1 AND new_followers IS NOT NULL AND recorded_on > $2::date AND recorded_on <= $3::date`,
      [platform, recorded_on, next.recorded_on]
    );
    if (Number(g[0]?.days) > 0) openingGain = Number(g[0].gained);
  }
  return { platform, recorded_on, next, openingGain };
}

function within(date: string, w: TimeWindow): boolean {
  return date >= w.startDate && date <= w.endDate;
}

/** The window takes in the uncertain reading itself. */
export function includesReading(b: UncertainBaseline | null, w: TimeWindow): b is UncertainBaseline {
  return b !== null && within(b.recorded_on, w);
}

/** The window takes in the step up from the uncertain reading, in the platform's reported gains. */
export function includesOpeningStep(b: UncertainBaseline | null, w: TimeWindow): b is UncertainBaseline {
  return b !== null && b.next !== null && b.openingGain !== null && b.openingGain !== 0 && within(b.next.recorded_on, w);
}

/** Either of the two. This is the test for "is this window affected". */
export function affects(b: UncertainBaseline | null, w: TimeWindow): b is UncertainBaseline {
  return includesReading(b, w) || includesOpeningStep(b, w);
}

export type SupportedChange = { delta: number; from: Total; to: Total };

/**
 * The totals a window can stand on: the stored totals with the uncertain
 * reading left out, and the change between the first and last of what
 * remains. Null change when fewer than two remain.
 */
export function supportedTotals(
  totals: Total[],
  b: UncertainBaseline | null
): { points: Total[]; change: SupportedChange | null } {
  const points = b ? totals.filter((t) => t.recorded_on !== b.recorded_on) : totals;
  const change =
    points.length >= 2
      ? { delta: points[points.length - 1].followers - points[0].followers, from: points[0], to: points[points.length - 1] }
      : null;
  return { points, change };
}

/** "+12 since the recorded total of 6 on 11 September" */
export function changeLabel(c: SupportedChange): string {
  return `${c.delta > 0 ? '+' : ''}${full(c.delta)} since the recorded total of ${full(c.from.followers)} on ${longDate(c.from.recorded_on)}`;
}

/** The long version, for an information button. */
export function baselineExplanation(b: UncertainBaseline): string {
  const name = platformLabel(b.platform);
  const next = b.next
    ? ` The next read, on ${longDate(b.next.recorded_on)}, was ${full(b.next.followers)}.`
    : ' No later total has been stored yet.';
  const gains =
    b.next && b.openingGain !== null
      ? ` Separately, the platform reported ${full(b.openingGain)} new follower${b.openingGain === 1 ? '' : 's'} for ${longDate(
          b.next.recorded_on
        )}, the step up from that reading. That is the platform's own daily figure, a different measurement from the totals, and it is shown only where it is labelled as reported.`
      : '';
  return `The first follower total stored for the ${name} is 0, read on ${longDate(
    b.recorded_on
  )}.${next} Whether the account had no followers on that day or the reading had not caught up cannot be established from what is stored. The 0 is kept in the record, but it is not drawn and not used as a starting point, so any change is counted between recorded totals from the next one on.${gains}`;
}

/** One line for beside the platform's reported gains, when the window takes in the opening step. */
export function reportedGainsDisclosure(b: UncertainBaseline): string {
  if (!b.next || b.openingGain === null) return '';
  return `Includes ${full(b.openingGain)} reported for ${longDate(b.next.recorded_on)}, the step up from the uncertain first reading of 0`;
}
