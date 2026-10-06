import { sql } from '@/lib/db';
import { SOCIAL_PLATFORMS, type PlatformFilter, type SocialPlatform } from '@/lib/overview';
import type { TimeWindow } from '@/lib/period';

/**
 * One piece of content across Instagram, the Facebook Page and the Facebook
 * Profile.
 *
 * Nothing stored says two posts are the same content: posts has one row per
 * account post and no field joining them. So a group exists only where Liz
 * confirmed it (migration 012). A matching caption or a nearby publish time
 * produces a suggestion and never a merge.
 *
 * What may be added across accounts, and what may not:
 *
 *   Views. Instagram `views` and the Page's `post_media_view` are each the
 *   post's running total as of the latest daily read, so the two are added
 *   and called "Total reported views". It is a sum of reported views, never
 *   unique viewers and never reach: the same person on two accounts counts
 *   twice. The Profile's Views come from Facebook's Content Library with a
 *   scope the collector could not establish (the screen it reads is headed
 *   "Last 28 days"), stored as scope 'unknown'. A figure with an unknown
 *   scope is shown beside the total and never added to it.
 *
 *   Comments and shares. Counts of the same thing on each account, added
 *   under the same scope rule.
 *
 *   Reactions. Instagram reports likes, Facebook reports reactions of every
 *   kind. Different definitions, so they are shown per account under their
 *   own names and never added.
 *
 *   Engagement, reach, viewers. Not combined at all. Each account defines
 *   engagement differently and unique people cannot be added.
 *
 * Every figure is the latest reading per post, never a sum across days, and
 * never a reading at a fixed age: this view shows current totals only and
 * does not mix them with the 72 hour readings the Formats page uses.
 *
 * Nothing here changes an account total, a ranking or a benchmark elsewhere,
 * and the Profile stays out of every existing benchmark.
 */

export type Scope = 'lifetime' | 'unknown';

export type Copy = {
  id: number;
  platform: SocialPlatform;
  format: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  published_at: string;
  /** The Profile's publish time exactly as Facebook displayed it, when that is all there is. */
  published_label: string | null;
  views: number | null;
  /** Instagram likes, or Facebook reactions of every kind. Named by reactionsLabel, never added. */
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  /** Whether this account's figures are known to be running totals. */
  scope: Scope;
  /** When the figures were last read. Null when the post has never been read. */
  read_at: string | null;
};

export function reactionsLabel(platform: string): string {
  return platform === 'instagram' ? 'Likes' : 'Reactions';
}

/** A timestamptz as an ISO string in UTC, so it sorts as text and parses anywhere. */
function iso(column: string): string {
  return `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
}

/** Whether migration 012 has been applied. Without it nothing can be linked, and the page says so. */
export async function hasGroupTables(): Promise<boolean> {
  const rows = await sql`SELECT to_regclass('public.content_group_members') IS NOT NULL AS ok`;
  return rows[0]?.ok === true;
}

async function hasProfileTables(): Promise<boolean> {
  const rows = await sql`SELECT to_regclass('public.profile_metrics') IS NOT NULL AS ok`;
  return rows[0]?.ok === true;
}

/**
 * Every post on the three accounts with its latest figures. Stories are left
 * out, as everywhere else. A few hundred rows at most, so the grouping and
 * the matching are done in code where they can be read.
 */
export async function getCopies(): Promise<Copy[]> {
  const api = await sql(`
    WITH latest AS (
      SELECT DISTINCT ON (post_id) post_id, views, likes, comments, shares, recorded_at
      FROM post_metrics ORDER BY post_id, recorded_on DESC
    )
    SELECT p.id, p.platform, p.format, p.caption, p.thumbnail_url, p.permalink,
           ${iso('p.published_at')} AS published_at, NULL::text AS published_label,
           l.views::float8 AS views, l.likes::float8 AS reactions, l.comments::float8 AS comments,
           l.shares::float8 AS shares, 'lifetime' AS scope, ${iso('l.recorded_at')} AS read_at
    FROM content_posts p LEFT JOIN latest l ON l.post_id = p.id
    WHERE p.format IS DISTINCT FROM 'story' AND p.published_at IS NOT NULL
  `);
  const profile = (await hasProfileTables())
    ? await sql(`
    WITH latest AS (
      SELECT DISTINCT ON (post_id, source, label) post_id, source, label, value, scope, collected_at
      FROM profile_metrics
      WHERE post_id IS NOT NULL
        AND ((source = 'library' AND label = 'Views') OR (source = 'timeline' AND label IN ('Reactions', 'Comments', 'Shares')))
      ORDER BY post_id, source, label, collected_at DESC
    ),
    figures AS (
      SELECT post_id,
             MAX(value) FILTER (WHERE label = 'Views')     AS views,
             MAX(value) FILTER (WHERE label = 'Reactions') AS reactions,
             MAX(value) FILTER (WHERE label = 'Comments')  AS comments,
             MAX(value) FILTER (WHERE label = 'Shares')    AS shares,
             -- One scope for the post: a running total only if every figure says so.
             BOOL_AND(scope = 'lifetime')                   AS all_lifetime,
             MAX(collected_at)                              AS read_at
      FROM latest GROUP BY post_id
    )
    SELECT p.id, p.platform, p.format, p.caption, p.thumbnail_url, p.permalink,
           ${iso('p.published_at')} AS published_at, pp.published_label,
           f.views::float8 AS views, f.reactions::float8 AS reactions, f.comments::float8 AS comments,
           f.shares::float8 AS shares,
           CASE WHEN f.all_lifetime THEN 'lifetime' ELSE 'unknown' END AS scope,
           ${iso('f.read_at')} AS read_at
    FROM posts p
    JOIN profile_posts pp ON pp.post_id = p.id AND pp.kind = 'post'
    LEFT JOIN figures f ON f.post_id = p.id
    WHERE p.platform = 'facebook-personal' AND p.published_at IS NOT NULL
  `)
    : [];
  return [...api, ...profile] as unknown as Copy[];
}

export type Suggestion = { a: Copy; b: Copy; reason: string };

/** One piece of content: a confirmed group, or a post nobody has linked to anything. */
export type Item = {
  /** The post id that opens this item. Stable for a single; the earliest copy for a group. */
  key: number;
  groupId: number | null;
  copies: Copy[];
  /** The earliest publish time among the copies. */
  first_published: string;
};

export type Combined = {
  linking: boolean;
  items: Item[];
  suggestions: Suggestion[];
  /** Every copy, for the picker that links by hand. */
  all: Copy[];
};

function normalise(caption: string | null): string {
  return (caption ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const DAY = 86_400_000;
const PREFIX = 40;

function apart(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 90) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 36) return `${hours} hours`;
  return `${Math.round(ms / DAY)} days`;
}

/**
 * Why two posts on different accounts might be the same content. Only ever a
 * suggestion. The opening of the caption has to match exactly over 40
 * characters within three days, or two posts with no usable caption have to
 * be published within fifteen minutes of each other.
 */
function suggest(a: Copy, b: Copy): string | null {
  if (a.platform === b.platform) return null;
  const gap = Math.abs(new Date(a.published_at).getTime() - new Date(b.published_at).getTime());
  const ca = normalise(a.caption);
  const cb = normalise(b.caption);
  if (ca.length >= 20 && cb.length >= 20) {
    return ca.slice(0, PREFIX) === cb.slice(0, PREFIX) && gap <= 3 * DAY
      ? `Captions open the same way, published ${apart(gap)} apart`
      : null;
  }
  if (ca.length < 20 && cb.length < 20 && gap <= 15 * 60_000) return `No caption to compare, published ${apart(gap)} apart`;
  return null;
}

function inWindow(c: Copy, w: TimeWindow): boolean {
  const t = new Date(c.published_at).getTime();
  return t >= w.start.getTime() && t < w.end.getTime();
}

/**
 * Everything the Content page needs. An item is in the window when any of
 * its copies was published in it, and then shows all of its copies, so a
 * copy published on another day is not lost at the window's edge.
 */
export async function getCombined(period: TimeWindow, platform: PlatformFilter): Promise<Combined> {
  const linking = await hasGroupTables();
  const all = await getCopies();
  const byId = new Map(all.map((c) => [c.id, c]));

  const groupOf = new Map<number, number>();
  const dismissed = new Set<string>();
  if (linking) {
    for (const r of await sql`SELECT post_id, group_id FROM content_group_members`) {
      if (byId.has(r.post_id as number)) groupOf.set(r.post_id as number, r.group_id as number);
    }
    for (const r of await sql`SELECT post_a, post_b FROM content_group_dismissals`) dismissed.add(`${r.post_a}-${r.post_b}`);
  }

  const groups = new Map<number, Copy[]>();
  for (const [postId, groupId] of groupOf) groups.set(groupId, [...(groups.get(groupId) ?? []), byId.get(postId) as Copy]);

  const items: Item[] = [];
  const order = (copies: Copy[]) => [...copies].sort((x, y) => x.published_at.localeCompare(y.published_at));
  for (const [groupId, copies] of groups) {
    const sorted = order(copies);
    items.push({ key: sorted[0].id, groupId, copies: sorted, first_published: sorted[0].published_at });
  }
  for (const c of all) {
    if (!groupOf.has(c.id)) items.push({ key: c.id, groupId: null, copies: [c], first_published: c.published_at });
  }

  const shown = items
    .filter((i) => i.copies.some((c) => inWindow(c, period)))
    .filter((i) => platform === 'all' || i.copies.some((c) => c.platform === platform))
    .sort((x, y) => y.first_published.localeCompare(x.first_published));

  // Suggestions between items that are not already together, never across a
  // pair Liz dismissed, and never where linking would put two posts from one
  // account in the same group.
  const suggestions: Suggestion[] = [];
  const candidates = all.filter((c) => inWindow(c, period));
  for (const a of candidates) {
    for (const b of all) {
      if (a.id === b.id || (inWindow(b, period) && b.id < a.id)) continue;
      const ga = groupOf.get(a.id);
      const gb = groupOf.get(b.id);
      if (ga !== undefined && ga === gb) continue;
      const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
      if (dismissed.has(`${lo}-${hi}`)) continue;
      const reason = suggest(a, b);
      if (!reason) continue;
      const accounts = [...(ga !== undefined ? (groups.get(ga) as Copy[]) : [a]), ...(gb !== undefined ? (groups.get(gb) as Copy[]) : [b])];
      if (new Set(accounts.map((c) => c.platform)).size !== accounts.length) continue;
      if (platform !== 'all' && a.platform !== platform && b.platform !== platform) continue;
      suggestions.push(a.published_at <= b.published_at ? { a, b, reason } : { a: b, b: a, reason });
    }
  }
  suggestions.sort((x, y) => y.a.published_at.localeCompare(x.a.published_at));

  return { linking, items: shown, suggestions, all };
}

/** The item a post belongs to, wherever it was published. For the breakdown view. */
export async function getItemForPost(postId: number): Promise<{ linking: boolean; item: Item | null; all: Copy[] }> {
  const linking = await hasGroupTables();
  const all = await getCopies();
  const self = all.find((c) => c.id === postId);
  if (!self) return { linking, item: null, all };
  let copies = [self];
  let groupId: number | null = null;
  if (linking) {
    const rows = await sql`
      SELECT m.post_id, m.group_id FROM content_group_members m
      WHERE m.group_id = (SELECT group_id FROM content_group_members WHERE post_id = ${postId})`;
    if (rows.length > 0) {
      groupId = rows[0].group_id as number;
      const ids = new Set(rows.map((r) => r.post_id as number));
      copies = all.filter((c) => ids.has(c.id));
    }
  }
  copies.sort((x, y) => x.published_at.localeCompare(y.published_at));
  return { linking, item: { key: copies[0].id, groupId, copies, first_published: copies[0].published_at }, all };
}

export type Metric = 'views' | 'comments' | 'shares';

export type Total = {
  /** The sum of the figures that may be added. Null when none of them is known. */
  value: number | null;
  /** Accounts whose figure is in the sum. */
  included: SocialPlatform[];
  /** Accounts with a copy whose figure could be added but is missing. The total is partial. */
  missing: SocialPlatform[];
  /** Accounts with a copy whose figure has an unknown scope, shown beside the total and not added. */
  apart: SocialPlatform[];
  /** Accounts with no copy linked. */
  absent: SocialPlatform[];
  partial: boolean;
};

/** A combined total for one metric, with exactly which accounts it stands on. */
export function totalOf(item: Item, metric: Metric): Total {
  const included: SocialPlatform[] = [];
  const missing: SocialPlatform[] = [];
  const apartFrom: SocialPlatform[] = [];
  let sum = 0;
  for (const c of item.copies) {
    if (c.scope !== 'lifetime') apartFrom.push(c.platform);
    else if (c[metric] === null) missing.push(c.platform);
    else {
      included.push(c.platform);
      sum += c[metric] as number;
    }
  }
  const present = new Set(item.copies.map((c) => c.platform));
  // Always named in the same account order, whichever copy was published first.
  const ordered = (list: SocialPlatform[]) => SOCIAL_PLATFORMS.filter((p) => list.includes(p));
  return {
    value: included.length > 0 ? sum : null,
    included: ordered(included),
    missing: ordered(missing),
    apart: ordered(apartFrom),
    absent: SOCIAL_PLATFORMS.filter((p) => !present.has(p)),
    partial: missing.length > 0,
  };
}
