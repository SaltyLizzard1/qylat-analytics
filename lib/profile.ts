import { sql } from '@/lib/db';

/**
 * Reads for the Facebook Profile page. The personal profile is collected by
 * the local scraper into profile_collections, profile_posts and
 * profile_metrics (migration 010). None of it enters content_posts,
 * post_metrics or any benchmark, and nothing here reads those.
 *
 * Every figure is returned as it was read, with the time it was read. A
 * missing figure stays missing: these queries never coalesce to zero.
 */

export type ProfileFigure = { raw: string | null; value: number | null; at: string };

export type ProfilePost = {
  id: number;
  kind: 'post' | 'story';
  caption: string | null;
  caption_complete: boolean | null;
  published_at: string | null;
  published_label: string | null;
  permalink: string | null;
  in_latest_library: boolean;
  library_at: string | null;
  figures: Record<string, ProfileFigure>;
};

/** The most recent collections, newest first, with what failed in each. */
export async function getProfileCollections(limit = 7) {
  return sql`
    SELECT collection_id, collected_at, timeline_status, library_status, audience_status,
           timezone, timezone_check, library_period_label, audience_period_label,
           jsonb_array_length(unmatched)::int AS unmatched
    FROM profile_collections
    ORDER BY collected_at DESC
    LIMIT ${limit}
  `;
}

/**
 * The latest exact follower total and its change from the previous one.
 * is_daily is true only between consecutive days. Across a gap, `change` is
 * the change over `days` days and must not be labelled a daily gain.
 */
export async function getProfileFollowers() {
  const rows = await sql`
    SELECT recorded_on, followers, previous_on, change, days, is_daily
    FROM profile_follower_changes
    ORDER BY recorded_on DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/** Net follows and Unfollows as last read, each with the period Facebook displayed. */
export async function getProfileAudienceFigures() {
  return sql`
    SELECT label, raw, value, period_label, collected_at
    FROM profile_metrics_latest
    WHERE source = 'audience'
  `;
}

/**
 * Posts and stories with the latest reading of each figure, keyed
 * "source:label", for example "library:Viewers" or "timeline:Reactions".
 *
 * The latest reading is taken per figure rather than per collection, so a
 * post that has left the 28 day library keeps its last library figures beside
 * newer timeline ones. `at` on each figure says when it was read.
 */
export async function getProfilePosts(limit = 120): Promise<ProfilePost[]> {
  const rows = await sql`
    WITH latest AS (
      SELECT DISTINCT ON (post_id, source, label)
             post_id, source, label, raw, value, collected_at
      FROM profile_metrics
      WHERE post_id IS NOT NULL
      ORDER BY post_id, source, label, collected_at DESC
    ),
    figures AS (
      SELECT post_id,
             jsonb_object_agg(
               source || ':' || label,
               jsonb_build_object('raw', raw, 'value', value, 'at', collected_at)
             ) AS figures
      FROM latest
      GROUP BY post_id
    )
    SELECT p.id, pp.kind, p.caption, pp.caption_complete, p.published_at, pp.published_label,
           p.permalink,
           COALESCE(
             pp.last_library_collection =
               (SELECT MAX(id) FROM profile_collections WHERE library_status = 'ok'),
             FALSE
           ) AS in_latest_library,
           lc.collected_at AS library_at,
           COALESCE(f.figures, '{}'::jsonb) AS figures
    FROM posts p
    JOIN profile_posts pp ON pp.post_id = p.id
    LEFT JOIN profile_collections lc ON lc.id = pp.last_library_collection
    LEFT JOIN figures f ON f.post_id = p.id
    WHERE p.platform = 'facebook-personal'
    ORDER BY p.published_at DESC NULLS LAST, p.id DESC
    LIMIT ${limit}
  `;
  return rows as unknown as ProfilePost[];
}
