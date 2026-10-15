/**
 * How old a figure is, in words.
 *
 * Every post figure is a running total as of its last read, and the three
 * accounts are read at different times: Instagram and the Page once a day by
 * the sync, the Profile only when a collection is run. A figure read an hour
 * after publishing and a figure read three days after are both "views to
 * date", and nothing in the number says which. These helpers say it.
 *
 * Pure functions with no imports, so they are the same on the server and in
 * a test. The age that counts as young is passed in from lib/status.ts.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "56 min", "4 h", "3 days". Rounded down, so a reading never looks newer than it is. */
export function elapsed(ms: number): string {
  const t = Math.max(0, ms);
  if (t < HOUR) return `${Math.floor(t / MIN)} min`;
  if (t < 2 * DAY) return `${Math.floor(t / HOUR)} h`;
  return `${Math.floor(t / DAY)} days`;
}

export type Freshness = {
  /** "4 h ago": how long since the figure was read. */
  ago: string;
  /**
   * "56 min after publishing", when the figure was read before the post was
   * `youngHours` old. Null for an older reading, where the post's age no
   * longer moves the figure much, and when the publish time is after the read.
   */
  after: string | null;
};

/** Null when the post has never been read. */
export function freshness(
  readAt: string | Date | null,
  publishedAt: string | Date | null,
  youngHours: number,
  now: Date = new Date()
): Freshness | null {
  if (!readAt) return null;
  const read = new Date(readAt).getTime();
  if (Number.isNaN(read)) return null;
  const ago = `${elapsed(now.getTime() - read)} ago`;
  const published = publishedAt ? new Date(publishedAt).getTime() : NaN;
  const age = read - published;
  const after = Number.isNaN(published) || age < 0 || age >= youngHours * HOUR ? null : `${elapsed(age)} after publishing`;
  return { ago, after };
}

/**
 * Why a same-age comparison has nothing to show for one account, and when it
 * could. A post is measured at `ageHours` old, so it needs to be that old and
 * still inside the window.
 *
 * `rollingHours` is the window's length when it is a rolling one that ends
 * now, else null. `published` is when each of the account's posts in the
 * window went out, stories left out.
 */
export function sameAgeEmpty(
  ageHours: number,
  rollingHours: number | null,
  published: (string | Date)[],
  now: Date = new Date()
): { why: string; when: Date | null; never: boolean } {
  if (rollingHours !== null && rollingHours <= ageHours) {
    return {
      why: `This window is the last ${rollingHours} hours, and a post is measured when it is ${ageHours} hours old. By then it has left the window, so nothing can be compared here.`,
      when: null,
      never: true,
    };
  }
  if (published.length === 0) {
    return { why: 'No post was published in this window, so there is nothing to measure.', when: null, never: false };
  }
  const reaches = published
    .map((p) => new Date(p).getTime() + ageHours * HOUR)
    .filter((t) => t > now.getTime())
    .sort((a, b) => a - b);
  if (reaches.length === 0) {
    return {
      why: `Every post in this window is past ${ageHours} hours old, and none was read before it got there.`,
      when: null,
      never: false,
    };
  }
  const n = reaches.length;
  return {
    why: `${n === published.length ? (n === 1 ? 'The post' : `All ${n} posts`) : `${n} of the ${published.length} posts`} in this window ${
      n === 1 ? 'is' : 'are'
    } not ${ageHours} hours old yet.`,
    when: new Date(reaches[0]),
    never: false,
  };
}
