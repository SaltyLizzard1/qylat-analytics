/**
 * One comparison period for the whole dashboard.
 *
 * Read from the query string so a view is reproducible and shareable:
 *   /dashboard?period=7&compare=previous
 *
 * Every page that shows a comparison reads this, so there is exactly one
 * definition of "the current window" rather than a hardcoded 30 on one page
 * and a hardcoded 7 on another.
 */

export const PERIOD_CHOICES = [1, 3, 7, 14, 30] as const;

export const MAX_CUSTOM_DAYS = 365;

export type Compare = 'previous' | 'none';

export type Period = {
  /** Length of the current window, in days. */
  days: number;
  compare: Compare;
  /** True when `days` is not one of the preset choices. */
  custom: boolean;
  /** "Last 7 days", for headings. */
  label: string;
  /** "the 7 days before that", for the comparison half. */
  compareLabel: string;
};

function clampDays(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 7;
  return Math.min(Math.max(Math.floor(n), 1), MAX_CUSTOM_DAYS);
}

export function dayLabel(days: number): string {
  return days === 1 ? 'Last 24 hours' : `Last ${days} days`;
}

/**
 * Defaults to 7 days against the previous 7, as specified. A missing or
 * malformed parameter falls back rather than throwing, so a hand-edited URL
 * degrades to the default instead of a 500.
 */
export function parsePeriod(params: { period?: string; compare?: string } = {}): Period {
  const days = params.period === undefined ? 7 : clampDays(params.period);
  const compare: Compare = params.compare === 'none' ? 'none' : 'previous';
  const custom = !(PERIOD_CHOICES as readonly number[]).includes(days);

  return {
    days,
    compare,
    custom,
    label: dayLabel(days),
    compareLabel:
      compare === 'none'
        ? 'no comparison'
        : days === 1
          ? 'the 24 hours before that'
          : `the ${days} days before that`,
  };
}

/** Query string for a period, for links that must carry it forward. */
export function periodSearch(p: Pick<Period, 'days' | 'compare'>): string {
  const q = new URLSearchParams();
  q.set('period', String(p.days));
  if (p.compare !== 'previous') q.set('compare', p.compare);
  return q.toString();
}

/** Appends the current period to an internal href, preserving any existing query. */
export function withPeriod(href: string, p: Pick<Period, 'days' | 'compare'>): string {
  const [path, existing] = href.split('?');
  const q = new URLSearchParams(existing);
  q.set('period', String(p.days));
  if (p.compare === 'previous') q.delete('compare');
  else q.set('compare', p.compare);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/**
 * Age buckets for age-normalised comparison.
 *
 * Hours, not days, because `post_metrics.recorded_at` is a timestamp and a
 * post published at 09:00 is a very different thing from one published at
 * 23:00 when the sync runs at 08:00.
 */
export const AGE_CHOICES = [
  { hours: 24, label: 'First 24 hours', short: '24h' },
  { hours: 72, label: 'First 72 hours', short: '72h' },
  { hours: 168, label: 'First 7 days', short: '7d' },
] as const;

export type AgeChoice = (typeof AGE_CHOICES)[number];

export function parseAge(raw: string | undefined): AgeChoice {
  const n = Number(raw);
  return AGE_CHOICES.find((a) => a.hours === n) ?? AGE_CHOICES[0];
}
