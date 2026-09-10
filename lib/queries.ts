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
      p.content_theme, p.thumbnail_url,
      l.views, l.reach, l.engagement, l.likes, l.comments, l.saves, l.shares
    FROM posts p JOIN latest l ON l.post_id = p.id
    ORDER BY l.views DESC NULLS LAST, p.published_at DESC
    LIMIT ${Number(limit)}
  `);
}

/**
 * Median views and engagement rate per platform, across ALL posts.
 *
 * Median rather than mean, because one 479 view reel drags a mean upward and
 * would make every ordinary post look weak. Computed over every post, not just
 * the leaderboard's top rows, or the benchmark would be drawn from the winners.
 */
export async function getPlatformMedians(): Promise<Record<string, { views: number; engagementRate: number }>> {
  const rows = await sql(`
    WITH latest AS (
      SELECT DISTINCT ON (post_id) post_id, views, engagement
      FROM post_metrics ORDER BY post_id, recorded_on DESC
    )
    SELECT p.platform,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.views) AS median_views,
           PERCENTILE_CONT(0.5) WITHIN GROUP (
             ORDER BY CASE WHEN l.views > 0 THEN l.engagement::float / l.views ELSE 0 END
           ) AS median_eng_rate
    FROM posts p JOIN latest l ON l.post_id = p.id
    GROUP BY p.platform
  `);

  const out: Record<string, { views: number; engagementRate: number }> = {};
  for (const r of rows) {
    out[r.platform as string] = {
      views: Number(r.median_views) || 0,
      engagementRate: Number(r.median_eng_rate) || 0,
    };
  }
  return out;
}

/**
 * Platform comparison across every platform you actually use, not only the
 * ones with post data.
 *
 * TikTok and YouTube have no post integration, only /go/ link tracking. An
 * earlier version inner joined on posts, so TikTok vanished from the page
 * entirely and looked like it did not exist rather than like it is not
 * measured. Post columns come back NULL for those, which the view renders as
 * "not integrated" rather than as zero. Zero would claim the posts got no
 * views, when the truth is that nothing can see them.
 */
export async function getPlatformComparison(): Promise<Row[]> {
  return sql(`
    ${LATEST},
    used AS (
      SELECT DISTINCT platform FROM posts
      UNION
      SELECT DISTINCT platform FROM links
    ),
    post_stats AS (
      SELECT
        p.platform,
        COUNT(*)::int                          AS posts,
        COALESCE(SUM(l.views), 0)::int         AS views,
        COALESCE(ROUND(AVG(l.views)), 0)::int  AS avg_views,
        COALESCE(SUM(l.engagement), 0)::int    AS engagement,
        COALESCE(SUM(l.reach), 0)::int         AS reach
      FROM posts p JOIN latest l ON l.post_id = p.id
      GROUP BY p.platform
    )
    SELECT
      u.platform,
      s.posts, s.views, s.avg_views, s.engagement, s.reach,
      (s.platform IS NOT NULL) AS has_posts
    FROM used u LEFT JOIN post_stats s ON s.platform = u.platform
    ORDER BY COALESCE(s.views, -1) DESC, u.platform
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

/**
 * Posts, views and engagement per theme, plus the untagged remainder.
 *
 * Feeds the pillar mix: what actually got published against the intended
 * share. Performance alone does not answer "am I posting the right balance",
 * which is the question the pillars exist to answer.
 */
export async function getPillarMix(): Promise<{ rows: Row[]; taggedPosts: number; totalPosts: number }> {
  const rows = await sql(`
    WITH latest AS (
      SELECT DISTINCT ON (post_id) post_id, views, engagement
      FROM post_metrics ORDER BY post_id, recorded_on DESC
    )
    SELECT p.content_theme AS theme,
           COUNT(*)::int                        AS posts,
           COALESCE(SUM(l.views), 0)::int       AS views,
           COALESCE(SUM(l.engagement), 0)::int  AS engagement,
           COALESCE(ROUND(AVG(l.views)), 0)::int AS avg_views
    FROM posts p JOIN latest l ON l.post_id = p.id
    WHERE p.content_theme IS NOT NULL AND p.content_theme <> ''
    GROUP BY p.content_theme
    ORDER BY posts DESC
  `);

  const counts = await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE content_theme IS NOT NULL AND content_theme <> '')::int AS tagged
    FROM posts
  `;

  return {
    rows,
    taggedPosts: (counts[0]?.tagged as number) ?? 0,
    totalPosts: (counts[0]?.total as number) ?? 0,
  };
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

export type PostFilter = 'all' | 'untagged' | 'tagged';

/**
 * Posts for the admin tagging screen, newest first.
 *
 * The untagged filter exists so working through a backlog is a countdown
 * rather than a re-scan: a row leaves the list the moment it is saved.
 */
export async function getPostsForTagging(filter: PostFilter = 'all'): Promise<Row[]> {
  const where =
    filter === 'untagged'
      ? `WHERE p.content_theme IS NULL OR p.content_theme = ''`
      : filter === 'tagged'
        ? `WHERE p.content_theme IS NOT NULL AND p.content_theme <> ''`
        : '';

  return sql(`
    ${LATEST}
    SELECT
      p.id, p.platform, p.format, p.permalink, p.published_at,
      p.caption, p.content_theme, p.thumbnail_url, l.views, l.engagement
    FROM posts p LEFT JOIN latest l ON l.post_id = p.id
    ${where}
    ORDER BY p.published_at DESC
  `);
}

/** Counts for the filter tabs, so each one shows how much work is left. */
export async function getPostTagCounts(): Promise<{ all: number; tagged: number; untagged: number }> {
  const rows = await sql`
    SELECT COUNT(*)::int AS all_posts,
           COUNT(*) FILTER (WHERE content_theme IS NOT NULL AND content_theme <> '')::int AS tagged
    FROM posts
  `;
  const all = (rows[0]?.all_posts as number) ?? 0;
  const tagged = (rows[0]?.tagged as number) ?? 0;
  return { all, tagged, untagged: all - tagged };
}

/* ------------------------------------------------------------------ */
/* Funnel: clicks to sessions                                          */
/* ------------------------------------------------------------------ */

/**
 * Per link: first party clicks against Google Analytics sessions.
 *
 * The two will not agree, and the gap is the point of the view. A click is
 * logged the instant the redirect is hit. A session needs the browser to load
 * the site and run the GA script, which in-app browsers, ad blockers, consent
 * banners and bots all interfere with. Clicks above sessions is normal.
 * Sessions above clicks means traffic arrived on that UTM without passing
 * through the /go/ redirect.
 */
export async function getLinkFunnel(): Promise<Row[]> {
  return sql(`
    WITH clicks AS (
      SELECT slug, COUNT(*)::int AS clicks FROM click_events GROUP BY slug
    ),
    ga AS (
      SELECT content AS slug,
             SUM(sessions)::int         AS sessions,
             SUM(engaged_sessions)::int AS engaged,
             SUM(key_events)::int       AS key_events
      FROM site_sessions GROUP BY content
    )
    SELECT
      l.slug, l.platform, l.format, l.cta_type, l.content_theme,
      COALESCE(c.clicks, 0)    AS clicks,
      COALESCE(g.sessions, 0)  AS sessions,
      COALESCE(g.engaged, 0)   AS engaged,
      COALESCE(g.key_events, 0) AS key_events
    FROM links l
    LEFT JOIN clicks c ON c.slug = l.slug
    LEFT JOIN ga     g ON g.slug = l.slug
    ORDER BY COALESCE(c.clicks, 0) DESC, l.slug
  `);
}

/** Funnel rolled up by platform. */
export async function getPlatformFunnel(): Promise<Row[]> {
  return sql(`
    WITH clicks AS (
      SELECT l.platform, COUNT(c.id)::int AS clicks
      FROM links l LEFT JOIN click_events c ON c.slug = l.slug
      GROUP BY l.platform
    ),
    ga AS (
      SELECT l.platform,
             SUM(s.sessions)::int         AS sessions,
             SUM(s.engaged_sessions)::int AS engaged
      FROM site_sessions s JOIN links l ON l.slug = s.content
      GROUP BY l.platform
    )
    SELECT c.platform,
           c.clicks,
           COALESCE(g.sessions, 0) AS sessions,
           COALESCE(g.engaged, 0)  AS engaged
    FROM clicks c LEFT JOIN ga g ON g.platform = c.platform
    ORDER BY c.clicks DESC
  `);
}

/**
 * GA traffic on UTM values that match no link, plus everything untagged.
 * Untracked traffic is a finding, not noise, so it gets shown rather than
 * quietly dropped by the join.
 */
export async function getUnmatchedTraffic(): Promise<Row[]> {
  return sql(`
    SELECT s.source, s.medium, s.content,
           SUM(s.sessions)::int         AS sessions,
           SUM(s.engaged_sessions)::int AS engaged
    FROM site_sessions s
    WHERE NOT EXISTS (SELECT 1 FROM links l WHERE l.slug = s.content)
    GROUP BY s.source, s.medium, s.content
    HAVING SUM(s.sessions) > 0
    ORDER BY sessions DESC
    LIMIT 15
  `);
}

/** Whether any GA data has landed, for the empty state. */
export async function getGaStatus(): Promise<{ rows: number; lastSynced: string | null; latestDate: string | null }> {
  const r = await sql`
    SELECT COUNT(*)::int AS n, MAX(synced_at) AS last_synced, MAX(session_date) AS latest
    FROM site_sessions
  `;
  return {
    rows: (r[0]?.n as number) ?? 0,
    lastSynced: (r[0]?.last_synced as string) ?? null,
    latestDate: (r[0]?.latest as string) ?? null,
  };
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

/**
 * Follower gain attributed to content themes.
 *
 * A post published on day D is credited with the follower gain from D through
 * D plus LOOKAHEAD_DAYS, because a follow rarely happens in the same minute as
 * the view. Days are deduplicated per theme, so two posts of the same theme in
 * one week do not double count the same day's followers.
 *
 * This is attribution, not causation, and with a small number of follower
 * events it is weak attribution. `attributed_days` is returned so the view can
 * show how thin the evidence is instead of implying precision.
 */
export async function getThemeFollowerAttribution(lookaheadDays = 2): Promise<Row[]> {
  const lookahead = Math.max(0, Math.min(Math.floor(lookaheadDays), 14));
  return sql(`
    WITH latest AS (
      SELECT DISTINCT ON (post_id) post_id, views
      FROM post_metrics ORDER BY post_id, recorded_on DESC
    ),
    tagged AS (
      SELECT p.content_theme AS theme, p.published_at::date AS day
      FROM posts p
      WHERE p.content_theme IS NOT NULL AND p.content_theme <> ''
        AND p.published_at IS NOT NULL
    ),
    windows AS (
      SELECT DISTINCT t.theme, (t.day + o.offs) AS day
      FROM tagged t CROSS JOIN generate_series(0, ${lookahead}) AS o(offs)
    ),
    gains AS (
      SELECT w.theme,
             SUM(a.new_followers)::int      AS followers_gained,
             COUNT(DISTINCT w.day)::int     AS attributed_days
      FROM windows w
      JOIN audience_snapshots a
        ON a.recorded_on = w.day
       AND a.platform = 'instagram'
       AND a.new_followers IS NOT NULL
      GROUP BY w.theme
    ),
    post_side AS (
      SELECT p.content_theme AS theme,
             COUNT(*)::int                    AS posts,
             COALESCE(SUM(l.views), 0)::int   AS views
      FROM posts p JOIN latest l ON l.post_id = p.id
      WHERE p.content_theme IS NOT NULL AND p.content_theme <> ''
      GROUP BY p.content_theme
    )
    SELECT ps.theme, ps.posts, ps.views,
           COALESCE(g.followers_gained, 0) AS followers_gained,
           COALESCE(g.attributed_days, 0)  AS attributed_days
    FROM post_side ps LEFT JOIN gains g ON g.theme = ps.theme
    ORDER BY followers_gained DESC, views DESC
  `);
}

/**
 * Posts published and followers gained, per week, on the same weeks.
 * Only weeks where follower data exists, so the two series line up honestly.
 */
export async function getWeeklyGrowthOverlap(): Promise<Row[]> {
  return sql(`
    WITH latest AS (
      SELECT DISTINCT ON (post_id) post_id, views
      FROM post_metrics ORDER BY post_id, recorded_on DESC
    ),
    pub AS (
      SELECT DATE_TRUNC('week', p.published_at)::date AS week,
             COUNT(*)::int                  AS posts,
             COALESCE(SUM(l.views), 0)::int AS views
      FROM posts p JOIN latest l ON l.post_id = p.id
      WHERE p.published_at IS NOT NULL
      GROUP BY 1
    ),
    fol AS (
      SELECT DATE_TRUNC('week', recorded_on)::date AS week,
             SUM(new_followers)::int AS gained
      FROM audience_snapshots
      WHERE platform = 'instagram' AND new_followers IS NOT NULL
      GROUP BY 1
    )
    SELECT TO_CHAR(f.week, 'YYYY-MM-DD') AS week,
           COALESCE(p.posts, 0)  AS posts,
           COALESCE(p.views, 0)  AS views,
           f.gained
    FROM fol f LEFT JOIN pub p ON p.week = f.week
    ORDER BY f.week
  `);
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
