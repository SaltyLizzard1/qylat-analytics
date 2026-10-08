/**
 * The order linked posts are re-read in, and the loop that re-reads them.
 *
 * One queue across Instagram and the Facebook Page, least recently read
 * first. A post never read at all is first of all. The order comes from the
 * stored read times alone: Meta returns posts newest first, and following
 * that order once left the stalest Page posts unread run after run, because
 * the time ran out before the loop got down to them.
 *
 * The clock is checked before each post, never during one. A post that
 * fails, or that Meta did not return, is recorded and the queue moves on.
 * Whatever was not reached keeps its old read time, so it is at the front
 * of the queue on the next run.
 *
 * No imports, so the order and the loop can be tested without the app.
 */

export type DuePost = { platform: string; id: string; readAt: string | null };

const time = (p: DuePost) => (p.readAt === null ? -Infinity : new Date(p.readAt).getTime());
export const queueKey = (p: { platform: string; id: string }) => `${p.platform}:${p.id}`;

/**
 * Least recently read first, across accounts. At most `maxPerAccount` posts
 * of any one account are taken, counted in that same order, so the cap drops
 * an account's freshest posts and never its stalest. Ties keep a fixed order.
 */
export function buildQueue(due: DuePost[], maxPerAccount: number): { queue: DuePost[]; overCap: DuePost[] } {
  const sorted = [...due].sort((a, b) => time(a) - time(b) || queueKey(a).localeCompare(queueKey(b)));
  const taken = new Map<string, number>();
  const queue: DuePost[] = [];
  const overCap: DuePost[] = [];
  for (const p of sorted) {
    const n = taken.get(p.platform) ?? 0;
    if (n < maxPerAccount) {
      queue.push(p);
      taken.set(p.platform, n + 1);
    } else overCap.push(p);
  }
  return { queue, overCap };
}

/**
 * Works through the queue in its own order. `found` is what Meta returned,
 * keyed by account and id, in whatever order it came. `work` re-reads one
 * post and must throw if it did not store a reading.
 */
export async function runQueue<T>(
  queue: DuePost[],
  found: Map<string, T>,
  deadline: number,
  work: (post: DuePost, object: T) => Promise<void>,
  now: () => number = Date.now
): Promise<{ refreshed: DuePost[]; notReached: DuePost[]; failed: { post: DuePost; reason: string }[]; stoppedForTime: boolean }> {
  const refreshed: DuePost[] = [];
  const failed: { post: DuePost; reason: string }[] = [];
  let i = 0;
  for (; i < queue.length; i++) {
    if (now() >= deadline) break;
    const post = queue[i];
    const object = found.get(queueKey(post));
    if (object === undefined) {
      failed.push({ post, reason: 'Meta did not return this post' });
      continue;
    }
    try {
      await work(post, object);
      refreshed.push(post);
    } catch (e) {
      failed.push({ post, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { refreshed, notReached: queue.slice(i), failed, stoppedForTime: i < queue.length };
}
