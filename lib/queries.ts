import { sql } from '@/lib/db';

/**
 * Every dashboard query lives here.
 *
 * Two rules the whole file depends on:
 *
 * 1. post_metrics holds one snapshot per post per day, so every query must read
 *    the LATEST snapshot per post, never SUM across days. That is what the
 *    `latest` CTE below does. Right now there is one snapshot per post, so a
 *    naive SUM would look correct and would silently start double counting on
 *    the second day of syncing.
 *
 * 2. Views, not reach. Meta returns 0 for Facebook reach on every post
 *    (post_total_media_view_unique is accepted but never populated), so any
 *    cross platform comparison built on reach shows Facebook as dead. Views is
 *    populated on both platforms.
 */

/** Latest metrics snapshot per post, joined to its post row. */
const LATEST = `
  WITH latest AS (
    SELECT DISTINCT ON (m.post_id)
      m.post_id, m.views, m.reach, m.engagement, m.likes, m.comments,
      m.saves, m.shares, m.profile_visits, m.link_clicks, m.recorded_on
    FROM post_metrics m
    ORDER BY m.post_id, m.recorded_on DESC
  )
`;

export type Row = Record<string, unknown>;

export async function getOverview() {
  const rows = await sql(`
    ${LATEST}
    SELECT
      COUNT(*)::int                          AS posts,
      COALESCE(SUM(l.views), 0)::int         AS views,
      COALESCE(SUM(l.engagement), 0)::int    AS engagement,
      MIN(p.published_at)                    AS earliest,
      MAX(p.published_at)                    AS latest_post
    FROM posts p JOIN latest l ON l.post_id = p.id
  `);
  const clicks = await sql`SELECT COUNT(*)::int AS n FROM click_events`;
  const links = await sql`SELECT COUNT(*)::int AS n FROM links`;
  const synced = await sql`SELECT MAX(last_synced_at) AS at FROM posts`;

  return {
    posts: (rows[0]?.posts as number) ?? 0,
    views: (rows[0]?.views as number) ?? 0,
    engagement: (rows[0]?.engagement as number) ?? 0,
    earliest: (rows[0]?.earliest as string) ?? null,
    latestPost: (rows[0]?.latest_post as string) ?? null,
    clicks: (clicks[0]?.n as number) ?? 0,
    links: (links[0]?.n as number) ?? 0,
    lastSyncedAt: (synced[0]?.at as string) ?? null,
  };
}

/** Views and posts published per ISO week. */
export async function getWeeklyViews(): Promise<Row[]> {
  return sql(`
    ${LATEST}
    SELECT
      TO_CHAR(DATE_TRUNC('week', p.published_at), 'YYYY-MM-DD') AS week,
      COUNT(*)::int                       AS posts,
      COALESCE(SUM(l.views), 0)::int      AS views
    FROM posts p JOIN latest l ON l.post_id = p.id
    WHERE p.published_at IS NOT NULL
    GROUP BY 1 ORDER BY 1
  `);
}

/** First party clicks per ISO week, from click_events. */
export async function getWeeklyClicks(): Promise<Row[]> {
  return sql(`
    SELECT
      TO_CHAR(DATE_TRUNC('week', clicked_at), 'YYYY-MM-DD') AS week,
      COUNT(*)::int AS clicks
    FROM click_events
    GROUP BY 1 ORDER BY 1
  `);
}

export async function getLeaderboard(limit = 30): Promise<Row[]> {
  return sql(`
    ${LATEST}
    SELECT
      p.id, p.platform, p.format, p.permalink, p.published_at, p.caption,
      p.content_theme,
      l.views, l.reach, l.engagement, l.likes, l.comments, l.saves, l.shares
    FROM posts p JOIN latest l ON l.post_id = p.id
    ORDER BY l.views DESC NULLS LAST, p.published_at DESC
    LIMIT ${Number(limit)}
  `);
}

export async function getPlatformComparison(): Promise<Row[]> {
  return sql(`
    ${LATEST}
    SELECT
      p.platform,
      COUNT(*)::int                                    AS posts,
      COALESCE(SUM(l.views), 0)::int                   AS views,
      COALESCE(ROUND(AVG(l.views)), 0)::int            AS avg_views,
      COALESCE(SUM(l.engagement), 0)::int              AS engagement,
      COALESCE(SUM(l.reach), 0)::int                   AS reach
    FROM posts p JOIN latest l ON l.post_id = p.id
    GROUP BY p.platform
    ORDER BY views DESC
  `);
}

/** Clicks attributed by the platform recorded on the /go/ link. */
export async function getClicksByPlatform(): Promise<Row[]> {
  return sql(`
    SELECT
      k.platform,
      COUNT(DISTINCT k.slug)::int AS links,
      COUNT(c.id)::int            AS clicks
    FROM links k LEFT JOIN click_events c ON c.slug = k.slug
    GROUP BY k.platform
    ORDER BY clicks DESC
  `);
}

export async function getFormatComparison(): Promise<Row[]> {
  return sql(`
    ${LATEST}
    SELECT
      p.platform, p.format,
      COUNT(*)::int                            AS posts,
      COALESCE(ROUND(AVG(l.views)), 0)::int    AS avg_views,
      COALESCE(ROUND(AVG(l.engagement)), 0)::int AS avg_engagement,
      COALESCE(SUM(l.views), 0)::int           AS views
    FROM posts p JOIN latest l ON l.post_id = p.id
    GROUP BY p.platform, p.format
    ORDER BY avg_views DESC
  `);
}

/**
 * Content theme performance.
 *
 * Posts carry a theme only once it has been tagged in admin, since Meta has no
 * such field. Links carry a theme from the link creator. This joins both sides
 * on the theme string so a theme shows its published reach and its clicks
 * together, and includes themes present on only one side.
 */
export async function getThemePerformance(): Promise<Row[]> {
  return sql(`
    ${LATEST},
    post_side AS (
      SELECT p.content_theme AS theme,
             COUNT(*)::int AS posts,
             COALESCE(SUM(l.views), 0)::int AS views,
             COALESCE(SUM(l.engagement), 0)::int AS engagement
      FROM posts p JOIN latest l ON l.post_id = p.id
      WHERE p.content_theme IS NOT NULL AND p.content_theme <> ''
      GROUP BY p.content_theme
    ),
    link_side AS (
      SELECT k.content_theme AS theme,
             COUNT(DISTINCT k.slug)::int AS links,
             COUNT(c.id)::int AS clicks
      FROM links k LEFT JOIN click_events c ON c.slug = k.slug
      WHERE k.content_theme IS NOT NULL AND k.content_theme <> ''
      GROUP BY k.content_theme
    )
    SELECT
      COALESCE(a.theme, b.theme) AS theme,
      COALESCE(a.posts, 0)       AS posts,
      COALESCE(a.views, 0)       AS views,
      COALESCE(a.engagement, 0)  AS engagement,
      COALESCE(b.links, 0)       AS links,
      COALESCE(b.clicks, 0)      AS clicks
    FROM post_side a FULL OUTER JOIN link_side b ON a.theme = b.theme
    ORDER BY clicks DESC, views DESC
  `);
}

/** How many posts still need a theme, for the empty state prompt. */
export async function getUntaggedPostCount(): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*)::int AS n FROM posts
    WHERE content_theme IS NULL OR content_theme = ''
  `;
  return (rows[0]?.n as number) ?? 0;
}

export async function getCtaPerformance(): Promise<Row[]> {
  return sql(`
    SELECT
      COALESCE(k.cta_type, 'unset')  AS cta_type,
      COUNT(DISTINCT k.slug)::int    AS links,
      COUNT(c.id)::int               AS clicks
    FROM links k LEFT JOIN click_events c ON c.slug = k.slug
    GROUP BY k.cta_type
    ORDER BY clicks DESC
  `);
}

/** Posts for the admin tagging screen, newest first. */
export async function getPostsForTagging(): Promise<Row[]> {
  return sql(`
    ${LATEST}
    SELECT
      p.id, p.platform, p.format, p.permalink, p.published_at,
      p.caption, p.content_theme, l.views, l.engagement
    FROM posts p LEFT JOIN latest l ON l.post_id = p.id
    ORDER BY p.published_at DESC
  `);
}

/* ------------------------------------------------------------------ */
/* Audience                                                            */
/* ------------------------------------------------------------------ */

export const AUDIENCE_PLATFORMS = [
  { value: 'facebook-personal', label: 'Facebook personal profile', manualOnly: true },
  { value: 'tiktok', label: 'TikTok', manualOnly: true },
  { value: 'youtube', label: 'YouTube', manualOnly: true },
  { value: 'instagram', label: 'Instagram', manualOnly: false },
  { value: 'facebook', label: 'Facebook Page', manualOnly: false },
] as const;

/** Most recent follower total per account, whatever its source. */
export async function getLatestAudience(): Promise<Row[]> {
  return sql(`
    SELECT DISTINCT ON (platform)
      platform, account_label, followers, source, recorded_on
    FROM audience_snapshots
    WHERE followers IS NOT NULL
    ORDER BY platform, recorded_on DESC
  `);
}

/** Follower total over time, for the trend chart. */
export async function getAudienceHistory(platform: string): Promise<Row[]> {
  return sql`
    SELECT recorded_on, followers
    FROM audience_snapshots
    WHERE platform = ${platform} AND followers IS NOT NULL
    ORDER BY recorded_on
  `;
}

/** New followers per ISO week, from the daily gains the platform reported. */
export async function getWeeklyFollowerGains(platform: string): Promise<Row[]> {
  return sql`
    SELECT TO_CHAR(DATE_TRUNC('week', recorded_on), 'YYYY-MM-DD') AS week,
           SUM(new_followers)::int AS gained
    FROM audience_snapshots
    WHERE platform = ${platform} AND new_followers IS NOT NULL
    GROUP BY 1 ORDER BY 1
  `;
}

/** Everything typed in by hand, newest first, for the admin screen. */
export async function getManualAudienceEntries(): Promise<Row[]> {
  return sql`
    SELECT id, recorded_on, platform, account_label, followers
    FROM audience_snapshots
    WHERE source = 'manual'
    ORDER BY recorded_on DESC, platform
    LIMIT 100
  `;
}

/** How many distinct days carry a follower gain, to gate the theme view. */
export async function getFollowerSignalStrength(): Promise<{ days: number; total: number }> {
  const rows = await sql`
    SELECT COUNT(*) FILTER (WHERE new_followers > 0)::int AS days,
           COALESCE(SUM(new_followers), 0)::int AS total
    FROM audience_snapshots WHERE new_followers IS NOT NULL
  `;
  return { days: (rows[0]?.days as number) ?? 0, total: (rows[0]?.total as number) ?? 0 };
}

/** Existing themes from both tables, for the tagging dropdown. */
export async function getKnownThemes(): Promise<string[]> {
  const rows = await sql`
    SELECT DISTINCT theme FROM (
      SELECT content_theme AS theme FROM links WHERE content_theme IS NOT NULL AND content_theme <> ''
      UNION
      SELECT content_theme AS theme FROM posts WHERE content_theme IS NOT NULL AND content_theme <> ''
    ) t ORDER BY theme
  `;
  return rows.map((r) => r.theme as string);
}
