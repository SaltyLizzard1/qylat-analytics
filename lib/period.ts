/**
 * One comparison period for the whole dashboard.
 *
 * Read from the query string so a view is reproducible and shareable:
 *
 *   ?period=7                        last 7 days, against the 7 before
 *   ?period=this-month               month to date, against the same number of
 *                                    days at the start of last month
 *   ?period=last-month               the previous calendar month, against the
 *                                    month before it
 *   ?from=2026-08-01&to=2026-08-31   a custom range, against the equal length
 *                                    range immediately before it
 *   &compare=none                    hides the comparison
 *
 * Every page reads this, so there is exactly one definition of "the current
 * window" rather than a hardcoded 30 on one page and a hardcoded 7 on another.
 *
 * A window carries two shapes of the same range, because the tables hold two
 * kinds of column. `start` and `end` are instants, end exclusive, for
 * timestamptz columns such as published_at and clicked_at. `startDate` and
 * `endDate` are calendar dates, both inclusive, for DATE columns such as
 * session_date and recorded_on. Calendar dates are in DASHBOARD_TZ, so "this
 * month" starts at midnight in Chiang Mai rather than at midnight UTC.
 *
 * A rolling window of N days means the last N calendar dates including today
 * for DATE columns, and the last N times 24 hours for timestamps. The two
 * differ by a few hours at the near edge, which is the honest reading of each
 * column type rather than a bug to paper over.
 */

export const PERIOD_CHOICES = [1, 3, 7, 14, 30] as const;

export const MAX_CUSTOM_DAYS = 365;

/** Calendar boundaries are taken in this zone. */
export const DASHBOARD_TZ = 'Asia/Bangkok';

export type Compare = 'previous' | 'none';

export type PeriodKind = 'rolling' | 'this-month' | 'last-month' | 'custom';

export type TimeWindow = {
  /** Instant the window opens, inclusive. */
  start: Date;
  /** Instant the window closes, exclusive. */
  end: Date;
  /** First calendar date in the window, inclusive, YYYY-MM-DD in DASHBOARD_TZ. */
  startDate: string;
  /** Last calendar date in the window, inclusive. */
  endDate: string;
};

export type Period = TimeWindow & {
  kind: PeriodKind;
  /** Length of the current window in whole days. */
  days: number;
  compare: Compare;
  /** True for a custom date range. */
  custom: boolean;
  /** The window compared against, same length, immediately before. */
  previous: TimeWindow;
  /** "Last 7 days", "September so far", "1 Aug to 31 Aug 2026". */
  label: string;
  /** "the 7 days before that", "the first 19 days of August", for the comparison half. */
  compareLabel: string;
};

export type PeriodParams = { period?: string; compare?: string; from?: string; to?: string };

/* ------------------------------------------------------------------ */
/* Calendar arithmetic                                                 */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Year, month (1 to 12) and day of an instant, as seen in a time zone. */
function partsIn(tz: string, instant: Date): { y: number; m: number; d: number } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(instant).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}

/**
 * The instant of local midnight on a calendar date in a time zone. Month and
 * day may run past their range, and Date.UTC normalises them, so (2026, 0, 1)
 * is December 2025 and (2026, 2, 31) is March 3rd.
 */
function zonedMidnight(tz: string, y: number, m: number, d: number): Date {
  const guess = Date.UTC(y, m - 1, d);
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const asLocal = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  const offset = asLocal - guess;
  return new Date(guess - offset);
}

/** YYYY-MM-DD, with the same normalisation as zonedMidnight. */
function isoDate(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

function splitIso(iso: string): { y: number; m: number; d: number } {
  return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) };
}

function addDaysIso(iso: string, n: number): string {
  const { y, m, d } = splitIso(iso);
  return isoDate(y, m, d + n);
}

function utcMidnight(iso: string): number {
  const { y, m, d } = splitIso(iso);
  return Date.UTC(y, m - 1, d);
}

/** Number of calendar dates from a to b, both inclusive. */
function daysInclusive(a: string, b: string): number {
  return Math.round((utcMidnight(b) - utcMidnight(a)) / DAY_MS) + 1;
}

function validIso(s: string | undefined): s is string {
  if (!s || !ISO_DATE.test(s)) return false;
  const { y, m, d } = splitIso(s);
  return isoDate(y, m, d) === s;
}

/** "August 2026", with month overflow normalised. */
function monthLabel(y: number, m: number): string {
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "September", with month overflow normalised. */
function monthName(y: number, m: number): string {
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
}

/** "1 Aug 2026" from YYYY-MM-DD. */
export function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function dayLabel(days: number): string {
  return days === 1 ? 'Last 24 hours' : `Last ${days} days`;
}

/* ------------------------------------------------------------------ */
/* Building a period                                                   */
/* ------------------------------------------------------------------ */

type Built = Omit<Period, 'compare' | 'compareLabel'> & { compareLabel: string };

function clampDays(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 7;
  return Math.min(Math.max(Math.floor(n), 1), MAX_CUSTOM_DAYS);
}

function rolling(days: number, now: Date): Built {
  const ms = days * DAY_MS;
  const t = partsIn(DASHBOARD_TZ, now);
  const today = isoDate(t.y, t.m, t.d);
  const startDate = addDaysIso(today, -(days - 1));
  const start = new Date(now.getTime() - ms);
  return {
    kind: 'rolling',
    days,
    custom: false,
    start,
    end: now,
    startDate,
    endDate: today,
    previous: {
      start: new Date(now.getTime() - 2 * ms),
      end: start,
      startDate: addDaysIso(startDate, -days),
      endDate: addDaysIso(startDate, -1),
    },
    label: dayLabel(days),
    compareLabel: days === 1 ? 'the 24 hours before that' : `the ${days} days before that`,
  };
}

/**
 * Month to date against the same number of days at the start of last month.
 * A partial month against a full one always reads as a drop, which is why the
 * previous window is cut to the same length.
 */
function thisMonth(now: Date): Built {
  const { y, m, d } = partsIn(DASHBOARD_TZ, now);
  const start = zonedMidnight(DASHBOARD_TZ, y, m, 1);
  const startDate = isoDate(y, m, 1);
  const today = isoDate(y, m, d);
  const days = d;

  const prevStart = zonedMidnight(DASHBOARD_TZ, y, m - 1, 1);
  const prevStartDate = isoDate(y, m - 1, 1);
  const prevLastDate = addDaysIso(startDate, -1);
  // Last month may be shorter than the days elapsed in this one, so the
  // previous window is capped at the month boundary rather than spilling into
  // the current window.
  const wantedEnd = new Date(prevStart.getTime() + (now.getTime() - start.getTime()));
  const capped = wantedEnd.getTime() > start.getTime();
  const wantedEndDate = addDaysIso(prevStartDate, days - 1);

  return {
    kind: 'this-month',
    days,
    custom: false,
    start,
    end: now,
    startDate,
    endDate: today,
    previous: {
      start: prevStart,
      end: capped ? start : wantedEnd,
      startDate: prevStartDate,
      endDate: wantedEndDate > prevLastDate ? prevLastDate : wantedEndDate,
    },
    label: `${monthName(y, m)} so far`,
    compareLabel: capped
      ? `the whole of ${monthName(y, m - 1)}`
      : `the first ${days} ${days === 1 ? 'day' : 'days'} of ${monthName(y, m - 1)}`,
  };
}

/** The previous calendar month, whole, against the month before it. */
function lastMonth(now: Date): Built {
  const { y, m } = partsIn(DASHBOARD_TZ, now);
  const start = zonedMidnight(DASHBOARD_TZ, y, m - 1, 1);
  const end = zonedMidnight(DASHBOARD_TZ, y, m, 1);
  const startDate = isoDate(y, m - 1, 1);
  const endDate = addDaysIso(isoDate(y, m, 1), -1);
  const prevStartDate = isoDate(y, m - 2, 1);
  return {
    kind: 'last-month',
    days: daysInclusive(startDate, endDate),
    custom: false,
    start,
    end,
    startDate,
    endDate,
    previous: {
      start: zonedMidnight(DASHBOARD_TZ, y, m - 2, 1),
      end: start,
      startDate: prevStartDate,
      endDate: addDaysIso(startDate, -1),
    },
    label: monthLabel(y, m - 1),
    compareLabel: monthLabel(y, m - 2),
  };
}

/** A custom range, both dates inclusive, against the equal length range before it. */
function custom(fromRaw: string, toRaw: string): Built {
  let from = fromRaw;
  let to = toRaw;
  if (from > to) [from, to] = [to, from];
  let days = daysInclusive(from, to);
  if (days > MAX_CUSTOM_DAYS) {
    to = addDaysIso(from, MAX_CUSTOM_DAYS - 1);
    days = MAX_CUSTOM_DAYS;
  }
  const f = splitIso(from);
  const t = splitIso(to);
  const start = zonedMidnight(DASHBOARD_TZ, f.y, f.m, f.d);
  const end = zonedMidnight(DASHBOARD_TZ, t.y, t.m, t.d + 1);
  const prevStartDate = addDaysIso(from, -days);
  const prevEndDate = addDaysIso(from, -1);
  const p = splitIso(prevStartDate);
  return {
    kind: 'custom',
    days,
    custom: true,
    start,
    end,
    startDate: from,
    endDate: to,
    previous: {
      start: zonedMidnight(DASHBOARD_TZ, p.y, p.m, p.d),
      end: start,
      startDate: prevStartDate,
      endDate: prevEndDate,
    },
    label: from === to ? fmtDate(from) : `${fmtDate(from)} to ${fmtDate(to)}`,
    compareLabel: `${fmtDate(prevStartDate)} to ${fmtDate(prevEndDate)}`,
  };
}

/**
 * Defaults to 7 days against the previous 7. A missing or malformed parameter
 * falls back rather than throwing, so a hand-edited URL degrades to the
 * default instead of a 500. `now` is injectable for tests.
 */
export function parsePeriod(params: PeriodParams = {}, now: Date = new Date()): Period {
  const compare: Compare = params.compare === 'none' ? 'none' : 'previous';

  let built: Built;
  if (validIso(params.from) && validIso(params.to)) {
    built = custom(params.from, params.to);
  } else if (params.period === 'this-month') {
    built = thisMonth(now);
  } else if (params.period === 'last-month') {
    built = lastMonth(now);
  } else {
    built = rolling(params.period === undefined ? 7 : clampDays(params.period), now);
  }

  return {
    ...built,
    compare,
    compareLabel: compare === 'none' ? 'no comparison' : built.compareLabel,
  };
}

/* ------------------------------------------------------------------ */
/* SQL                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Several queries build their SQL as strings, so a window reaching them must
 * be reduced to literals that cannot carry anything else. Instants are
 * re-serialised through Date, dates are re-validated, and the column name is
 * checked against a strict pattern. This is the only route a period takes
 * into a query.
 */
function checkColumn(column: string): void {
  if (!/^[a-z_][a-z0-9_.]*$/i.test(column)) throw new Error(`Unsafe column name: ${column}`);
}

function sqlInstant(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) throw new Error('Invalid window instant');
  return `'${d.toISOString()}'::timestamptz`;
}

function sqlDate(iso: string): string {
  if (!validIso(iso)) throw new Error(`Invalid window date: ${iso}`);
  return `'${iso}'::date`;
}

/** Boolean expression: a timestamptz column falls inside the window. */
export function windowExpr(w: TimeWindow, column: string): string {
  checkColumn(column);
  return `${column} >= ${sqlInstant(w.start)} AND ${column} < ${sqlInstant(w.end)}`;
}

/** Boolean expression: a DATE column falls inside the window. */
export function windowDateExpr(w: TimeWindow, column: string): string {
  checkColumn(column);
  return `${column} >= ${sqlDate(w.startDate)} AND ${column} <= ${sqlDate(w.endDate)}`;
}

/** SQL fragment restricting a timestamptz column to the window, or empty for all time. */
export function windowSql(w: TimeWindow | null | undefined, column: string): string {
  return w ? `AND ${windowExpr(w, column)}` : '';
}

/** SQL fragment restricting a DATE column to the window, or empty for all time. */
export function windowDateSql(w: TimeWindow | null | undefined, column: string): string {
  return w ? `AND ${windowDateExpr(w, column)}` : '';
}

/* ------------------------------------------------------------------ */
/* URLs                                                                */
/* ------------------------------------------------------------------ */

/** Writes a period into a query string, replacing whatever period it held. */
export function applyPeriod(q: URLSearchParams, p: Pick<Period, 'kind' | 'days' | 'compare' | 'startDate' | 'endDate'>): void {
  q.delete('period');
  q.delete('from');
  q.delete('to');
  if (p.kind === 'custom') {
    q.set('from', p.startDate);
    q.set('to', p.endDate);
  } else if (p.kind === 'rolling') {
    q.set('period', String(p.days));
  } else {
    q.set('period', p.kind);
  }
  if (p.compare === 'previous') q.delete('compare');
  else q.set('compare', p.compare);
}

/** Query string for a period, for links that must carry it forward. */
export function periodSearch(p: Pick<Period, 'kind' | 'days' | 'compare' | 'startDate' | 'endDate'>): string {
  const q = new URLSearchParams();
  applyPeriod(q, p);
  return q.toString();
}

/** Appends the current period to an internal href, preserving any existing query. */
export function withPeriod(href: string, p: Pick<Period, 'kind' | 'days' | 'compare' | 'startDate' | 'endDate'>): string {
  const [path, existing] = href.split('?');
  const q = new URLSearchParams(existing);
  applyPeriod(q, p);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/* ------------------------------------------------------------------ */
/* Age                                                                 */
/* ------------------------------------------------------------------ */

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
