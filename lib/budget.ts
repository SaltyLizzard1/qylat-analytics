/**
 * Does optional work one item at a time until a deadline, then stops.
 *
 * For work that is worth doing but must never cost the request it runs in:
 * the sync has 60 seconds on this plan, and a function killed at the limit
 * returns nothing at all. The clock is checked before each item, never
 * during one, so an item already started is finished and its result kept.
 * One item failing is recorded and the rest carry on.
 *
 * No imports, so it can be tested without the app.
 */
export async function withinBudget<T>(
  items: T[],
  deadline: number,
  work: (item: T) => Promise<void>,
  now: () => number = Date.now
): Promise<{ done: T[]; remaining: T[]; failed: { item: T; reason: string }[]; stoppedForTime: boolean }> {
  const done: T[] = [];
  const failed: { item: T; reason: string }[] = [];
  let i = 0;
  for (; i < items.length; i++) {
    if (now() >= deadline) break;
    try {
      await work(items[i]);
      done.push(items[i]);
    } catch (e) {
      failed.push({ item: items[i], reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { done, remaining: items.slice(i), failed, stoppedForTime: i < items.length };
}
