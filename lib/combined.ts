import { sql } from '@/lib/db';
import { SOCIAL_PLATFORMS, type PlatformFilter, type SocialPlatform } from '@/lib/overview';
import type { Evidence } from '@/lib/automatch';
import type { TimeWindow } from '@/lib/period';
import { THRESHOLDS } from '@/lib/status';

/**
 * One piece of content across Instagram, the Facebook Page and the Facebook
 * Profile.
 *
 * Nothing stored says two posts are the same content: posts has one row per
 * account post and no field joining them. So a group exists only where Liz
 * confirmed it by hand, or where the matcher in lib/automatch.ts found
 * complete identical captions with exactly one candidate per account. A
 * caption that only opens the same way, or a nearby publish time, produces a
 * suggestion and never a merge. Linking decides what is added together. It
 * does not make any figure newer: each account's figure is as old as its own
 * last read, which the page shows.
 *
 * What may be added across accounts, and what may not:
 *
 *   Views. Instagram `views`, the Page's `post_media_view` and the Profile's
 *   Content Library Views are each the post's running total as of its own
 *   last read, so they are added as "Total reported views". It is a sum of
 *   reported views, never unique viewers and never reach: the same person on
 *   two accounts counts twice. The readings are not taken at the same
 *   moment, so the page calls them latest recorded figures and shows each
 *   account's read date.
 *
 *   A Profile figure is added only when its own stored row says scope
 *   'lifetime', which the collector writes for the library's Views from the
 *   change that came with this. Rows collected before that are stored
 *   'unknown' and stay that way: they are shown beside the total, labelled
 *   as not included, and never added. Nothing relabels them.
 *
 *   What that rests on, checked read-only on 6 Oct 2026 in Meta's own
 *   screens:
 *     - Profile, scope. The Content Library's date range picks which posts
 *       are listed, by publish date, and does not limit the figure. With a
 *       range of 14 to 20 Sept, three posts showed 1,365, 1,063 and 456,
 *       each above what the collector stored for the same post on 5 Oct
 *       (1,363, 1,059, 454). A figure limited to a week that ended 16 days
 *       earlier could not have grown.
 *     - Profile, no Instagram inside it. One post's insights screen headed
 *       its chart "1,365 Facebook views", the same figure as its library
 *       row, and listed "Instagram views 133" on a separate line.
 *     - Page, no Instagram inside it. The Graph API reference describes
 *       post_media_view only as "The number of times your content was
 *       played or displayed" and does not say which apps it covers, so the
 *       documentation settles nothing. Meta's insights screen for a Page
 *       post (the carousel of 2 Oct) reads "28 Facebook views" with
 *       "Instagram views 283" on its own line. The API's post_media_view
 *       for that post was 26 at the read the day before, and the Instagram
 *       copy's API views were 263. So the API field is the "Facebook views"
 *       line, not the two added.
 *   The limits of that: three Profile posts and one Page post, on one day.
 *
 *   Comments and shares. Counts of the same thing on Instagram and the
 *   Page, added. The Profile's are stored 'unknown' and were not part of
 *   the check above, so they are shown per account and never added.
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
  /**
   * Whether each figure is known to be a running total, taken from the
   * stored observation. Per figure, because the Profile's Views were
   * verified and its comments and shares were not.
   */
  scope: Record<Metric, Scope>;
  /** When the figures were last read. Null when the post has never been read. */
  read_at: string | null;
  /** How this copy came to be in its group. Null when it is in none. */
  linked_by: 'manual' | 'auto' | null;
  /** What the matcher saw, for a copy it linked. */
  evidence: Evidence | null;
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
           l.shares::float8 AS shares, 'lifetime' AS views_scope, 'lifetime' AS other_scope,
           ${iso('l.recorded_at')} AS read_at
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
             -- The scope stored with the latest Views observation, and nothing
             -- inferred for it. Comments and shares come from the timeline and
             -- are a running total only if their own rows say so.
             MAX(scope) FILTER (WHERE label = 'Views')       AS views_scope,
             BOOL_AND(scope = 'lifetime') FILTER (WHERE label IN ('Comments', 'Shares')) AS other_lifetime,
             MAX(collected_at)                              AS read_at
      FROM latest GROUP BY post_id
    )
    SELECT p.id, p.platform, p.format, p.caption, p.thumbnail_url, p.permalink,
           ${iso('p.published_at')} AS published_at, pp.published_label,
           f.views::float8 AS views, f.reactions::float8 AS reactions, f.comments::float8 AS comments,
           f.shares::float8 AS shares,
           CASE WHEN f.views_scope = 'lifetime' THEN 'lifetime' ELSE 'unknown' END AS views_scope,
           CASE WHEN f.other_lifetime THEN 'lifetime' ELSE 'unknown' END AS other_scope,
           ${iso('f.read_at')} AS read_at
    FROM posts p
    JOIN profile_posts pp ON pp.post_id = p.id AND pp.kind = 'post'
    LEFT JOIN figures f ON f.post_id = p.id
    WHERE p.platform = 'facebook-personal' AND p.published_at IS NOT NULL
  `)
    : [];
  return [...api, ...profile].map((r) => {
    const { views_scope, other_scope, ...rest } = r as Record<string, unknown>;
    return {
      ...rest,
      scope: { views: views_scope as Scope, comments: other_scope as Scope, shares: other_scope as Scope },
      linked_by: null,
      evidence: null,
    } as unknown as Copy;
  });
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
  /** Whether the matcher linked every copy, some of them, or none. */
  auto: 'all' | 'some' | 'none';
};

function autoOf(copies: Copy[]): Item['auto'] {
  const n = copies.filter((c) => c.linked_by === 'auto').length;
  return n === 0 ? 'none' : n === copies.length ? 'all' : 'some';
}

/**
 * Membership rows with how each was made. Read through to_jsonb so the same
 * query works before migration 013, when the two columns do not exist yet
 * and every link reads as one Liz made.
 */
const MEMBERS = `SELECT m.post_id, m.group_id,
  COALESCE(to_jsonb(m)->>'linked_by', 'manual') AS linked_by, to_jsonb(m)->'evidence' AS evidence
  FROM content_group_members m`;

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
    for (const r of await sql(MEMBERS)) {
      const c = byId.get(r.post_id as number);
      if (!c) continue;
      groupOf.set(c.id, r.group_id as number);
      c.linked_by = r.linked_by as Copy['linked_by'];
      c.evidence = (r.evidence as Evidence | null) ?? null;
    }
    for (const r of await sql`SELECT post_a, post_b FROM content_group_dismissals`) dismissed.add(`${r.post_a}-${r.post_b}`);
  }

  const groups = new Map<number, Copy[]>();
  for (const [postId, groupId] of groupOf) groups.set(groupId, [...(groups.get(groupId) ?? []), byId.get(postId) as Copy]);

  const items: Item[] = [];
  const order = (copies: Copy[]) => [...copies].sort((x, y) => x.published_at.localeCompare(y.published_at));
  for (const [groupId, copies] of groups) {
    const sorted = order(copies);
    items.push({ key: sorted[0].id, groupId, copies: sorted, first_published: sorted[0].published_at, auto: autoOf(sorted) });
  }
  for (const c of all) {
    if (!groupOf.has(c.id)) items.push({ key: c.id, groupId: null, copies: [c], first_published: c.published_at, auto: 'none' });
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
    const rows = await sql(
      `${MEMBERS} WHERE m.group_id = (SELECT group_id FROM content_group_members WHERE post_id = $1)`,
      [postId]
    );
    if (rows.length > 0) {
      groupId = rows[0].group_id as number;
      const how = new Map(rows.map((r) => [r.post_id as number, r]));
      copies = all.filter((c) => how.has(c.id));
      for (const c of copies) {
        c.linked_by = how.get(c.id)?.linked_by as Copy['linked_by'];
        c.evidence = (how.get(c.id)?.evidence as Evidence | null) ?? null;
      }
    }
  }
  copies.sort((x, y) => x.published_at.localeCompare(y.published_at));
  return { linking, item: { key: copies[0].id, groupId, copies, first_published: copies[0].published_at, auto: autoOf(copies) }, all };
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
  /** The earliest and latest read among the figures in the sum. Never one moment. */
  readFrom: string | null;
  readTo: string | null;
  /**
   * Accounts in the sum whose figure was read more than
   * THRESHOLDS.staleReadHours before the newest reading for this content.
   */
  stale: SocialPlatform[];
};

/** Whether a copy's reading is stale beside the newest reading for the same content. */
export function isStale(item: Item, c: Copy): boolean {
  const reads = item.copies.map((x) => x.read_at).filter(Boolean) as string[];
  if (!c.read_at || reads.length === 0) return false;
  const newest = Math.max(...reads.map((r) => new Date(r).getTime()));
  return newest - new Date(c.read_at).getTime() > THRESHOLDS.staleReadHours * 3_600_000;
}

/** A combined total for one metric, with exactly which accounts it stands on. */
export function totalOf(item: Item, metric: Metric): Total {
  const included: SocialPlatform[] = [];
  const missing: SocialPlatform[] = [];
  const apartFrom: SocialPlatform[] = [];
  const stale: SocialPlatform[] = [];
  const reads: string[] = [];
  let sum = 0;
  for (const c of item.copies) {
    if (c.scope[metric] !== 'lifetime') apartFrom.push(c.platform);
    else if (c[metric] === null) missing.push(c.platform);
    else {
      included.push(c.platform);
      sum += c[metric] as number;
      if (c.read_at) reads.push(c.read_at);
      if (isStale(item, c)) stale.push(c.platform);
    }
  }
  reads.sort();
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
    readFrom: reads[0] ?? null,
    readTo: reads[reads.length - 1] ?? null,
    stale: ordered(stale),
  };
}
