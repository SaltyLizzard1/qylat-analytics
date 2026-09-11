import { sql } from '@/lib/db';

/**
 * Age-normalised post performance.
 *
 * The question this exists to answer is "is the content I am publishing now
 * performing better than what I published before", and cumulative views cannot
 * answer it. A post published two days ago has had two days to accumulate; one
 * published in June has had ninety. Measured on the twelve posts that currently
 * carry more than one snapshot, views roughly double over the first 48 hours,
 * so the bias is large, not academic.
 *
 * The fix is to compare posts at the same age. For a target age, take the
 * LATEST snapshot at or before it, never a later one, because a later snapshot
 * hands that post extra accumulation time and reintroduces the bias the whole
 * mechanism exists to remove.
 *
 * Age comes from `recorded_at - published_at`, a real interval, rather than
 * subtracting dates. The daily sync caps resolution at one sample per day, so
 * "first 24 hours" means "the latest snapshot taken within 24 hours of
 * publishing". A post published shortly after the 08:00 sync gets a snapshot
 * close to the 24 hour mark; one published shortly before gets one much
 * earlier. That is a limitation of sampling frequency, not of the schema, and
 * a manual sync a few hours after posting materially improves it.
 *
 * Nothing here is backfillable. post_metrics began on 2026-09-09, so posts
 * published before then have no early snapshot and never will: Meta returns a
 * post's current totals, never its history. Every function below reports its
 * sample size so a thin cell can say so instead of inventing a verdict.
 */

export type CohortStats = {
  posts: number;
  medianViews: number | null;
  avgViews: number | null;
  medianEngagementRate: number | null;
  savesPer1k: number | null;
  sharesPer1k: number | null;
};

export type CohortComparison = {
  ageHours: number;
  current: CohortStats;
  previous: CohortStats;
  /** Posts published in the window that have no snapshot young enough to use. */
  currentMissing: number;
  previousMissing: number;
};

/**
 * One snapshot per post, the latest at or before `ageHours`.
 *
 * Kept as a string fragment so every query below shares one definition of
 * "the post at this age". Two definitions would drift.
 */
const AT_AGE = (ageHours: number) => `
  at_age AS (
    SELECT DISTINCT ON (m.post_id)
      m.post_id,
      p.platform,
      p.format,
      p.published_at,
      m.views,
      m.engagement,
      m.saves,
      m.shares,
      EXTRACT(EPOCH FROM (m.recorded_at - p.published_at)) / 3600.0 AS age_hours
    FROM post_metrics m
    JOIN posts p ON p.id = m.post_id
    WHERE p.published_at IS NOT NULL
      AND m.recorded_at >= p.published_at
      AND EXTRACT(EPOCH FROM (m.recorded_at - p.published_at)) / 3600.0 <= ${Number(ageHours)}
    ORDER BY m.post_id, m.recorded_at DESC
  )
`;

function statsFrom(row: Record<string, unknown> | undefined): CohortStats {
  if (!row) {
    return { posts: 0, medianViews: null, avgViews: null, medianEngagementRate: null, savesPer1k: null, sharesPer1k: null };
  }
  const n = Number(row.posts) || 0;
  const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    posts: n,
    medianViews: n > 0 ? numOrNull(row.median_views) : null,
    avgViews: n > 0 ? numOrNull(row.avg_views) : null,
    medianEngagementRate: n > 0 ? numOrNull(row.median_eng_rate) : null,
    savesPer1k: n > 0 ? numOrNull(row.saves_per_1k) : null,
    sharesPer1k: n > 0 ? numOrNull(row.shares_per_1k) : null,
  };
}

/**
 * Posts published in the current window against those published in the
 * previous window, both measured at the same age.
 */
export async function getAgeNormalisedComparison(opts: {
  ageHours: number;
  currentDays: number;
  previousDays?: number;
  platform?: string;
  format?: string;
}): Promise<CohortComparison> {
  const age = Number(opts.ageHours);
  const cur = Number(opts.currentDays);
  const prev = Number(opts.previousDays ?? opts.currentDays);

  const filters: string[] = [];
  if (opts.platform) filters.push(`platform = '${opts.platform.replace(/'/g, "''")}'`);
  if (opts.format) filters.push(`format = '${opts.format.replace(/'/g, "''")}'`);
  const where = filters.length ? `AND ${filters.join(' AND ')}` : '';

  const rows = await sql(`
    WITH ${AT_AGE(age)},
    tagged AS (
      SELECT *,
        CASE
          WHEN published_at >= NOW() - INTERVAL '${cur} days' THEN 'current'
          WHEN published_at >= NOW() - INTERVAL '${cur + prev} days'
           AND published_at <  NOW() - INTERVAL '${cur} days' THEN 'previous'
          ELSE NULL
        END AS cohort
      FROM at_age
      WHERE TRUE ${where}
    )
    SELECT
      cohort,
      COUNT(*)::int AS posts,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY views) AS median_views,
      ROUND(AVG(views))::int AS avg_views,
      PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY CASE WHEN views > 0 THEN engagement::float / views ELSE 0 END
      ) AS median_eng_rate,
      CASE WHEN SUM(views) > 0 THEN SUM(COALESCE(saves,0))::float * 1000 / SUM(views) END AS saves_per_1k,
      CASE WHEN SUM(views) > 0 THEN SUM(COALESCE(shares,0))::float * 1000 / SUM(views) END AS shares_per_1k
    FROM tagged WHERE cohort IS NOT NULL
    GROUP BY cohort
  `);

  // Posts in each window with no snapshot young enough. Reported rather than
  // hidden, because a cohort of 5 posts where only 2 qualify is a different
  // claim from a cohort of 2.
  const missing = await sql(`
    SELECT
      COUNT(*) FILTER (WHERE p.published_at >= NOW() - INTERVAL '${cur} days')::int AS cur_total,
      COUNT(*) FILTER (WHERE p.published_at >= NOW() - INTERVAL '${cur + prev} days'
                         AND p.published_at <  NOW() - INTERVAL '${cur} days')::int AS prev_total
    FROM posts p
    WHERE p.published_at IS NOT NULL
      ${where ? where.replace(/platform/g, 'p.platform').replace(/format/g, 'p.format') : ''}
  `);

  const current = statsFrom(rows.find((r) => r.cohort === 'current'));
  const previous = statsFrom(rows.find((r) => r.cohort === 'previous'));

  return {
    ageHours: age,
    current,
    previous,
    currentMissing: Math.max(((missing[0]?.cur_total as number) ?? 0) - current.posts, 0),
    previousMissing: Math.max(((missing[0]?.prev_total as number) ?? 0) - previous.posts, 0),
  };
}

export type RecentPost = {
  id: number;
  platform: string;
  format: string;
  permalink: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  published_at: string;
  age_hours: number;
  views: number | null;
  engagement: number | null;
  saves: number | null;
  shares: number | null;
  views_24h: number | null;
  views_72h: number | null;
  /** Median views at 24h for same platform and format, excluding this post. */
  peer_median_24h: number | null;
  peer_count_24h: number | null;
};

/**
 * Recent posts with their early snapshots and a like-for-like benchmark.
 *
 * The benchmark is same platform plus same format, measured at the same age,
 * and excludes the post itself so a post is never compared against a set that
 * contains it.
 */
export async function getRecentPosts(days = 14): Promise<RecentPost[]> {
  const d = Number(days);
  const rows = await sql(`
    WITH ${AT_AGE(24)},
    at24 AS (SELECT post_id, platform, format, views AS v24 FROM at_age),
    a72 AS (
      SELECT DISTINCT ON (m.post_id) m.post_id, m.views AS v72
      FROM post_metrics m JOIN posts p ON p.id = m.post_id
      WHERE p.published_at IS NOT NULL
        AND m.recorded_at >= p.published_at
        AND EXTRACT(EPOCH FROM (m.recorded_at - p.published_at)) / 3600.0 <= 72
      ORDER BY m.post_id, m.recorded_at DESC
    ),
    latest AS (
      SELECT DISTINCT ON (post_id) post_id, views, engagement, saves, shares
      FROM post_metrics ORDER BY post_id, recorded_on DESC
    ),
    peers AS (
      SELECT platform, format,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v24) AS peer_median,
             COUNT(*)::int AS peer_n
      FROM at24 GROUP BY platform, format
    )
    SELECT
      p.id, p.platform, p.format, p.permalink, LEFT(p.caption, 160) AS caption,
      p.thumbnail_url, p.published_at,
      EXTRACT(EPOCH FROM (NOW() - p.published_at)) / 3600.0 AS age_hours,
      l.views, l.engagement, l.saves, l.shares,
      a24.v24 AS views_24h,
      a72.v72 AS views_72h,
      pe.peer_median AS peer_median_24h,
      pe.peer_n      AS peer_count_24h
    FROM posts p
    LEFT JOIN latest l ON l.post_id = p.id
    LEFT JOIN at24 a24 ON a24.post_id = p.id
    LEFT JOIN a72     ON a72.post_id = p.id
    LEFT JOIN peers pe ON pe.platform = p.platform AND pe.format = p.format
    WHERE p.published_at >= NOW() - INTERVAL '${d} days'
    ORDER BY p.published_at DESC
  `);

  // The driver returns untyped rows; numerics arrive as strings from Postgres
  // for the computed columns, so coerce rather than trusting the shape.
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return rows.map((r) => ({
    id: Number(r.id),
    platform: String(r.platform),
    format: String(r.format ?? 'other'),
    permalink: (r.permalink as string) ?? null,
    caption: (r.caption as string) ?? null,
    thumbnail_url: (r.thumbnail_url as string) ?? null,
    published_at: String(r.published_at),
    age_hours: Number(r.age_hours) || 0,
    views: n(r.views),
    engagement: n(r.engagement),
    saves: n(r.saves),
    shares: n(r.shares),
    views_24h: n(r.views_24h),
    views_72h: n(r.views_72h),
    peer_median_24h: n(r.peer_median_24h),
    peer_count_24h: n(r.peer_count_24h),
  }));
}

/** How much age-normalised history exists, so a view can say why a cell is empty. */
export async function getAgeCoverage(): Promise<{
  postsWith24h: number;
  postsWith72h: number;
  totalPosts: number;
  firstSnapshot: string | null;
}> {
  const r = await sql`
    WITH ages AS (
      SELECT m.post_id,
             MIN(EXTRACT(EPOCH FROM (m.recorded_at - p.published_at)) / 3600.0) AS youngest
      FROM post_metrics m JOIN posts p ON p.id = m.post_id
      WHERE p.published_at IS NOT NULL AND m.recorded_at >= p.published_at
      GROUP BY m.post_id
    )
    SELECT
      COUNT(*) FILTER (WHERE youngest <= 24)::int  AS with_24h,
      COUNT(*) FILTER (WHERE youngest <= 72)::int  AS with_72h,
      (SELECT COUNT(*)::int FROM posts)            AS total,
      (SELECT MIN(recorded_on) FROM post_metrics)  AS first_snapshot
    FROM ages
  `;
  return {
    postsWith24h: (r[0]?.with_24h as number) ?? 0,
    postsWith72h: (r[0]?.with_72h as number) ?? 0,
    totalPosts: (r[0]?.total as number) ?? 0,
    firstSnapshot: (r[0]?.first_snapshot as string) ?? null,
  };
}
