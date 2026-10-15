/**
 * Window totals from stored YouTube Analytics days. Pure, no imports, so it
 * is tested directly.
 *
 * Every total is null rather than a low number when a day in it lacks the
 * figure. The averages are exact, not averages of averages:
 *   average view duration    total minutes watched x 60 / total views
 *   average percentage viewed  daily percentages weighted by that day's
 *                            views. YouTube's figure is a mean per view, so
 *                            weighting by views recovers the window's mean,
 *                            to the two decimals YouTube rounds each day to.
 */

export type Day = {
  day: string;
  views: number | null;
  minutes: number | null;
  avgDuration: number | null;
  avgPercent: number | null;
  gained: number | null;
  lost: number | null;
};

export type Summary = {
  views: number | null;
  minutes: number | null;
  avgDurationSeconds: number | null;
  avgPercent: number | null;
  gained: number | null;
  lost: number | null;
  /** Days in the window up to the last processed day. */
  coveredDays: number;
  /** Of those, days YouTube returned no row for. */
  daysWithoutRow: number;
  /** Days at the end of the window YouTube has not finished processing. */
  pendingDays: number;
};

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY) + 1;

function sumAll(days: Day[], k: keyof Omit<Day, 'day'>): number | null {
  if (days.length === 0) return null;
  let total = 0;
  for (const d of days) {
    const v = d[k];
    if (v === null) return null;
    total += v;
  }
  return total;
}

export function summarise(days: Day[], startDate: string, endDate: string, dataThrough: string | null): Summary {
  const inWindow = days.filter((d) => d.day >= startDate && d.day <= endDate);
  const lastCovered = dataThrough && dataThrough < endDate ? dataThrough : endDate;
  const coveredDays = dataThrough === null || lastCovered < startDate ? 0 : daysBetween(startDate, lastCovered);
  // Days after the last processed one, inside the window.
  const nextDay = dataThrough === null ? startDate : new Date(toMs(dataThrough) + DAY).toISOString().slice(0, 10);
  const firstPending = nextDay > startDate ? nextDay : startDate;
  const pendingDays = firstPending > endDate ? 0 : daysBetween(firstPending, endDate);
  const coveredRows = inWindow.filter((d) => dataThrough !== null && d.day <= dataThrough).length;

  const views = sumAll(inWindow, 'views');
  const minutes = sumAll(inWindow, 'minutes');
  const avgDurationSeconds = views !== null && minutes !== null && views > 0 ? Math.round((minutes * 60) / views) : null;

  let avgPercent: number | null = null;
  if (views !== null && views > 0 && inWindow.every((d) => d.views === 0 || d.avgPercent !== null)) {
    const weighted = inWindow.reduce((s, d) => s + (d.views ? (d.avgPercent as number) * d.views : 0), 0);
    avgPercent = Math.round((weighted / views) * 10) / 10;
  }

  return {
    views,
    minutes,
    avgDurationSeconds,
    avgPercent,
    gained: sumAll(inWindow, 'gained'),
    lost: sumAll(inWindow, 'lost'),
    coveredDays,
    daysWithoutRow: Math.max(coveredDays - coveredRows, 0),
    pendingDays: Math.max(pendingDays, 0),
  };
}

/** "1 h 05 min", "4 min 12 s", "38 s". */
export function duration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(s).padStart(2, '0')} s`;
  return `${s} s`;
}
