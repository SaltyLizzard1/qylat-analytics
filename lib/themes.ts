import { sql } from '@/lib/db';
import { windowExpr, type TimeWindow } from '@/lib/period';

/**
 * Reads for the Themes page: what still needs a tag, and how tagged posts did.
 *
 * Tags live on content_posts, which holds Instagram and the Facebook Page.
 * The Facebook Profile is not in it, so nothing here counts or judges the
 * profile. Every figure is the latest snapshot per post, never a sum across
 * days, and a post with no views figure stays without one.
 */

const LATEST = `
  latest AS (
    SELECT DISTINCT ON (post_id) post_id, views, engagement
    FROM post_metrics ORDER BY post_id, recorded_on DESC
  )`;

const UNTAGGED = `(p.content_theme IS NULL OR p.content_theme = '')`;

/**
 * Stories are left out of every count here, as they are on the Overview and
 * in the post list a bar opens, so a count on this page matches the posts
 * behind it. A story is read once at whatever age it has, and its views do
 * not compare with a post's.
 */
const NOT_STORY = `p.format IS DISTINCT FROM 'story'`;

export type UntaggedPost = {
  id: number;
  platform: string;
  format: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  published_at: string;
  views: number | null;
};

/** Posts published in the window that carry no tag, newest first, with how many there are in all. Stories excluded. */
export async function getUntaggedInWindow(
  period: TimeWindow,
  limit = 12
): Promise<{ posts: UntaggedPost[]; untagged: number; total: number }> {
  const inWindow = windowExpr(period, 'p.published_at');
  const posts = await sql(`
    WITH ${LATEST}
    SELECT p.id, p.platform, p.format, LEFT(p.caption, 160) AS caption, p.thumbnail_url, p.permalink,
           p.published_at, l.views::float8 AS views
    FROM content_posts p LEFT JOIN latest l ON l.post_id = p.id
    WHERE ${UNTAGGED} AND ${NOT_STORY} AND p.published_at IS NOT NULL AND ${inWindow}
    ORDER BY p.published_at DESC
    LIMIT ${Number(limit)}
  `);
  const counts = await sql(`
    SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE ${UNTAGGED})::int AS untagged
    FROM content_posts p
    WHERE ${NOT_STORY} AND p.published_at IS NOT NULL AND ${inWindow}
  `);
  return {
    posts: posts as unknown as UntaggedPost[],
    untagged: Number(counts[0]?.untagged ?? 0),
    total: Number(counts[0]?.total ?? 0),
  };
}

/**
 * Every untagged post ever synced, whatever the window. Stories are counted
 * apart, since the admin tagging screen lists them and this page does not.
 */
export async function getUntaggedBacklog(): Promise<{ posts: number; stories: number }> {
  const rows = await sql(`
    SELECT COUNT(*) FILTER (WHERE ${NOT_STORY})::int AS posts,
           COUNT(*) FILTER (WHERE p.format = 'story')::int AS stories
    FROM content_posts p WHERE ${UNTAGGED}
  `);
  return { posts: Number(rows[0]?.posts ?? 0), stories: Number(rows[0]?.stories ?? 0) };
}

export type ThemeStat = {
  /** instagram or facebook. The two read views differently, so they are never pooled. */
  platform: string;
  theme: string;
  posts: number;
  /** How many of those posts have a views figure. */
  views_known: number;
  /** The middle post's views to date. Null when no post has a figure. */
  median_views: number | null;
  total_views: number | null;
};

/**
 * Tagged posts published in the window, by account and tag. The median is
 * the figure shown: a total follows how many posts carry the tag, and a mean
 * is moved by one large post. Views are each post's current lifetime total,
 * for posts of different ages. This is not an age-matched comparison and
 * must be labelled that way wherever it is drawn.
 */
export async function getThemeStats(period: TimeWindow): Promise<ThemeStat[]> {
  const rows = await sql(`
    WITH ${LATEST}
    SELECT p.platform, p.content_theme AS theme,
           COUNT(*)::int AS posts,
           COUNT(l.views)::int AS views_known,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.views)::float8 AS median_views,
           SUM(l.views)::float8 AS total_views
    FROM content_posts p LEFT JOIN latest l ON l.post_id = p.id
    WHERE p.content_theme IS NOT NULL AND p.content_theme <> ''
      AND ${NOT_STORY}
      AND p.published_at IS NOT NULL AND ${windowExpr(period, 'p.published_at')}
    GROUP BY p.platform, p.content_theme
    ORDER BY p.platform, median_views DESC NULLS LAST, posts DESC
  `);
  return rows as unknown as ThemeStat[];
}

/** A tag in a URL is only ever a slug. Anything else is dropped before it reaches SQL. */
export function parseTheme(raw: string | undefined): string | null {
  return raw && /^[a-z0-9][a-z0-9-]{0,59}$/.test(raw) ? raw : null;
}
