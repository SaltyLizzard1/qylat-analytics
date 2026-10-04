import { sql } from '@/lib/db';
import { DASHBOARD_TZ, applyPeriod, windowExpr, windowDateExpr, type Period, type TimeWindow } from '@/lib/period';

/**
 * Reads for the Overview and its post detail view.
 *
 * Three social accounts, never merged: Instagram and the Facebook Page, read
 * through Meta's API into post_metrics, and the Facebook Profile, read by the
 * local scraper into profile_metrics. The profile stays out of content_posts
 * and so out of every median and benchmark elsewhere; here it sits beside the
 * other two as its own labelled account.
 *
 * Rules every query here keeps:
 *   - The latest snapshot per post. post_metrics and profile_metrics hold a
 *     reading per day or per collection, and adding those together would
 *     count the same views again each day.
 *   - A missing figure is NULL and stays NULL. Sums skip it, and each total
 *     comes with how many posts actually had a figure, so "3 of 5 posts" can
 *     be shown instead of a total that quietly treats the other two as zero.
 *   - Views are added across posts. Viewers are not: one person who saw two
 *     posts is one viewer, so a sum of Viewers would be a number that
 *     describes nothing. No query here adds Viewers or reach.
 *   - Nothing compares a post figure with an earlier reading of itself. The
 *     profile's Content Library figures have an unverified scope, and all of
 *     these are totals to date for posts of different ages.
 */

export const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'facebook-personal'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type PlatformFilter = SocialPlatform | 'all';

export function parsePlatform(raw: string | undefined): PlatformFilter {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(raw ?? '') ? (raw as SocialPlatform) : 'all';
}

type PeriodLike = Pick<Period, 'kind' | 'days' | 'compare' | 'startDate' | 'endDate'>;

/**
 * An internal link that keeps the period and the platform filter, with any
 * extra parameters the destination needs. Every chart link and every way back
 * goes through this, so a filter can never be lost by clicking.
 */
export function withFilters(
  href: string,
  period: PeriodLike,
  platform: PlatformFilter,
  extra: Record<string, string | undefined> = {}
): string {
  const [path, existing] = href.split('?');
  const q = new URLSearchParams(existing);
  applyPeriod(q, period);
  if (platform === 'all') q.delete('platform');
  else q.set('platform', platform);
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** Before migration 010 the profile tables do not exist, and the Overview must still load. */
async function hasProfileTables(): Promise<boolean> {
  const rows = await sql`SELECT to_regclass('public.profile_metrics') IS NOT NULL AS ok`;
  return rows[0]?.ok === true;
}

/**
 * One row per post across the three accounts, with its latest figures.
 * `read_at` is when those figures were read. Stories are not posts here.
 */
function socialCte(includeProfile: boolean): string {
  const api = `
      SELECT p.id, p.platform, p.format, p.caption, p.thumbnail_url, p.permalink, p.published_at,
             NULL::text AS published_label,
             l.views::numeric AS views, l.engagement::numeric AS engagement, l.comments::numeric AS comments,
             l.recorded_on::timestamptz AS read_at
      FROM content_posts p JOIN latest l ON l.post_id = p.id
      -- Stories are left out for all three accounts. A story is read once, at
      -- whatever age it has that day, so its views are not comparable with a
      -- post's, and counting 22 stories as posts would triple a week's total.
      WHERE p.format IS DISTINCT FROM 'story'`;
  const profile = `
      UNION ALL
      SELECT p.id, p.platform, p.format, p.caption, p.thumbnail_url, p.permalink, p.published_at,
             pp.published_label,
             f.views, f.engagement, f.comments, f.read_at
      FROM posts p
      JOIN profile_posts pp ON pp.post_id = p.id AND pp.kind = 'post'
      LEFT JOIN profile_figures f ON f.post_id = p.id
      WHERE p.platform = 'facebook-personal'`;
  return `
    WITH latest AS (
      SELECT DISTINCT ON (m.post_id) m.post_id, m.views, m.engagement, m.comments, m.recorded_on
      FROM post_metrics m
      ORDER BY m.post_id, m.recorded_on DESC
    )${
      includeProfile
        ? `,
    profile_latest AS (
      SELECT DISTINCT ON (post_id, label) post_id, label, value, collected_at
      FROM profile_metrics
      WHERE source = 'library' AND post_id IS NOT NULL AND label IN ('Views', 'Engagement', 'Comments')
      ORDER BY post_id, label, collected_at DESC
    ),
    profile_figures AS (
      SELECT post_id,
             MAX(value) FILTER (WHERE label = 'Views')      AS views,
             MAX(value) FILTER (WHERE label = 'Engagement') AS engagement,
             MAX(value) FILTER (WHERE label = 'Comments')   AS comments,
             MAX(collected_at)                               AS read_at
      FROM profile_latest GROUP BY post_id
    )`
        : ''
    },
    social AS (${api}${includeProfile ? profile : ''}
    )`;
}

function platformClause(platform: PlatformFilter, column = 'platform'): string {
  // The value is checked against SOCIAL_PLATFORMS by parsePlatform, never raw input.
  return platform === 'all' ? '' : `AND ${column} = '${platform}'`;
}

/** The Monday a timestamp falls in, on the dashboard's calendar, as YYYY-MM-DD. */
const WEEK = `TO_CHAR(DATE_TRUNC('week', published_at AT TIME ZONE '${DASHBOARD_TZ}'), 'YYYY-MM-DD')`;

export type WeekRow = {
  week: string;
  platform: SocialPlatform;
  posts: number;
  views: number | null;
  views_known: number;
  engagement: number | null;
  engagement_known: number;
};

/** Posts published in the window, by publish week and account. Figures are totals to date. */
export async function getWeeklySocial(period: TimeWindow, platform: PlatformFilter): Promise<WeekRow[]> {
  const rows = await sql(`
    ${socialCte(await hasProfileTables())}
    SELECT ${WEEK} AS week, platform,
           COUNT(*)::int            AS posts,
           SUM(views)::float8       AS views,
           COUNT(views)::int        AS views_known,
           SUM(engagement)::float8  AS engagement,
           COUNT(engagement)::int   AS engagement_known
    FROM social
    WHERE published_at IS NOT NULL AND ${windowExpr(period, 'published_at')} ${platformClause(platform)}
    GROUP BY 1, 2 ORDER BY 1, 2
  `);
  return rows as unknown as WeekRow[];
}

export type PlatformRow = {
  platform: SocialPlatform;
  posts: number;
  prev_posts: number;
  views: number | null;
  views_known: number;
  median_views: number | null;
  engagement: number | null;
  engagement_known: number;
};

/** One row per account for posts published in the window, with the count in the window before. */
export async function getPlatformTotals(period: Period): Promise<PlatformRow[]> {
  const cur = windowExpr(period, 'published_at');
  const prev = windowExpr(period.previous, 'published_at');
  const rows = await sql(`
    ${socialCte(await hasProfileTables())}
    SELECT platform,
           COUNT(*) FILTER (WHERE ${cur})::int                     AS posts,
           COUNT(*) FILTER (WHERE ${prev})::int                    AS prev_posts,
           SUM(views) FILTER (WHERE ${cur})::float8                AS views,
           COUNT(views) FILTER (WHERE ${cur})::int                 AS views_known,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY views) FILTER (WHERE ${cur})::float8 AS median_views,
           SUM(engagement) FILTER (WHERE ${cur})::float8           AS engagement,
           COUNT(engagement) FILTER (WHERE ${cur})::int            AS engagement_known
    FROM social
    WHERE published_at IS NOT NULL
    GROUP BY platform
  `);
  return rows as unknown as PlatformRow[];
}

export type DetailPost = {
  id: number;
  platform: SocialPlatform;
  format: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  published_at: string;
  published_label: string | null;
  views: number | null;
  engagement: number | null;
  comments: number | null;
  read_at: string | null;
};

/**
 * The posts behind a chart mark: published in the window, optionally in one
 * publish week, optionally on one account. Ordered by views, unknown last.
 */
export async function getDetailPosts(
  period: TimeWindow,
  platform: PlatformFilter,
  week: string | null
): Promise<DetailPost[]> {
  const weekClause = week ? `AND ${WEEK} = '${week}'` : '';
  const rows = await sql(`
    ${socialCte(await hasProfileTables())}
    SELECT id, platform, format, caption, thumbnail_url, permalink, published_at, published_label,
           views::float8 AS views, engagement::float8 AS engagement, comments::float8 AS comments, read_at
    FROM social
    WHERE published_at IS NOT NULL AND ${windowExpr(period, 'published_at')}
      ${platformClause(platform)} ${weekClause}
    ORDER BY views DESC NULLS LAST, published_at DESC
    LIMIT 200
  `);
  return rows as unknown as DetailPost[];
}

/** A week parameter is only ever a date. Anything else is dropped before it reaches SQL. */
export function parseWeek(raw: string | undefined): string | null {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : null;
}

export type FollowerSeries = {
  platform: SocialPlatform;
  latest: { followers: number; recorded_on: string; source: string } | null;
  /** Follower totals inside the window, oldest first. */
  points: { recorded_on: string; followers: number }[];
  /**
   * Followers gained inside the window, where the account reports it or two
   * exact totals bracket it. Null when neither exists, which is unknown, not
   * zero.
   */
  gained: number | null;
  gainedHow: string;
};

/** Follower totals for the three accounts. Each account's figure names its own platform in the query. */
export async function getFollowerSeries(period: TimeWindow): Promise<FollowerSeries[]> {
  const inWindow = windowDateExpr(period, 'recorded_on');
  const out: FollowerSeries[] = [];
  for (const platform of SOCIAL_PLATFORMS) {
    const latest = await sql(
      `SELECT followers, recorded_on::text AS recorded_on, source FROM audience_snapshots
       WHERE platform = $1 AND followers IS NOT NULL ORDER BY recorded_on DESC LIMIT 1`,
      [platform]
    );
    const points = await sql(
      `SELECT recorded_on::text AS recorded_on, followers FROM audience_snapshots
       WHERE platform = $1 AND followers IS NOT NULL AND ${inWindow} ORDER BY recorded_on`,
      [platform]
    );

    let gained: number | null = null;
    let gainedHow = 'No gain figure for this window';
    if (platform === 'facebook-personal') {
      // No daily gains exist for the profile. Two totals inside the window
      // give the change between them, over however many days separate them.
      if (points.length >= 2) {
        const first = points[0];
        const last = points[points.length - 1];
        gained = Number(last.followers) - Number(first.followers);
        gainedHow = `change between the totals read on ${first.recorded_on} and ${last.recorded_on}`;
      } else {
        gainedHow = 'Needs two readings inside the window';
      }
    } else {
      const g = await sql(
        `SELECT SUM(new_followers)::int AS gained, COUNT(new_followers)::int AS days FROM audience_snapshots
         WHERE platform = $1 AND new_followers IS NOT NULL AND ${inWindow}`,
        [platform]
      );
      if (Number(g[0]?.days) > 0) {
        gained = Number(g[0].gained);
        gainedHow = `daily gains reported by the platform, ${g[0].days} days`;
      }
    }

    out.push({
      platform,
      latest: latest[0]
        ? {
            followers: Number(latest[0].followers),
            recorded_on: latest[0].recorded_on as string,
            source: latest[0].source as string,
          }
        : null,
      points: points.map((p) => ({ recorded_on: p.recorded_on as string, followers: Number(p.followers) })),
      gained,
      gainedHow,
    });
  }
  return out;
}

export type WebsiteTraffic = {
  sessions: { current: number; previous: number };
  clicks: { current: number; previous: number };
  /** Sessions per day inside the window. Days Google Analytics has no row for are absent, not zero. */
  daily: { day: string; sessions: number }[];
  gaLastSynced: string | null;
  gaLatestDate: string | null;
};

/**
 * Website sessions from Google Analytics and first party link clicks. Kept
 * apart from social views on purpose: a session is a visit to the website, a
 * view is an impression on a platform, and neither is a subset of the other.
 */
export async function getWebsiteTraffic(period: Period): Promise<WebsiteTraffic> {
  const [sessions, clicks, daily, ga] = await Promise.all([
    sql(`
      SELECT COALESCE(SUM(sessions) FILTER (WHERE ${windowDateExpr(period, 'session_date')}), 0)::int AS cur,
             COALESCE(SUM(sessions) FILTER (WHERE ${windowDateExpr(period.previous, 'session_date')}), 0)::int AS prev
      FROM site_sessions`),
    sql(`
      SELECT COUNT(*) FILTER (WHERE ${windowExpr(period, 'clicked_at')})::int AS cur,
             COUNT(*) FILTER (WHERE ${windowExpr(period.previous, 'clicked_at')})::int AS prev
      FROM human_clicks`),
    sql(`
      SELECT session_date::text AS day, SUM(sessions)::int AS sessions
      FROM site_sessions WHERE ${windowDateExpr(period, 'session_date')}
      GROUP BY 1 ORDER BY 1`),
    sql`SELECT MAX(synced_at) AS last_synced, MAX(session_date)::text AS latest FROM site_sessions`,
  ]);
  return {
    sessions: { current: Number(sessions[0]?.cur ?? 0), previous: Number(sessions[0]?.prev ?? 0) },
    clicks: { current: Number(clicks[0]?.cur ?? 0), previous: Number(clicks[0]?.prev ?? 0) },
    daily: daily.map((d) => ({ day: d.day as string, sessions: Number(d.sessions) })),
    gaLastSynced: (ga[0]?.last_synced as string) ?? null,
    gaLatestDate: (ga[0]?.latest as string) ?? null,
  };
}

/** When each source was last read, for the freshness line. */
export async function getFreshness(): Promise<{ meta: string | null; profile: string | null }> {
  const meta = await sql`SELECT MAX(last_synced_at) AS at FROM posts WHERE platform IN ('instagram', 'facebook')`;
  let profile: string | null = null;
  if (await hasProfileTables()) {
    const rows = await sql`SELECT MAX(collected_at) AS at FROM profile_collections`;
    profile = (rows[0]?.at as string) ?? null;
  }
  return { meta: (meta[0]?.at as string) ?? null, profile };
}
