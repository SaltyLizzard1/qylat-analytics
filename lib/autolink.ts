import { sql } from '@/lib/db';
import { planAutoLinks, type Excluded, type MatchPost, type PlannedLink } from '@/lib/automatch';
import { THRESHOLDS } from '@/lib/status';

/**
 * Loads what lib/automatch.ts needs, and writes what it decides.
 *
 * Runs at the end of a successful ingestion (the Meta sync and the Profile
 * collector's delivery), in the same request. There is no schedule, no
 * polling and no background task of its own.
 *
 * It only ever adds membership rows marked linked_by 'auto', with the
 * evidence stored beside them. It never removes or rewrites a link Liz made,
 * never touches a post or a figure, and never recreates a pair she dismissed
 * or unlinked: those pairs are in content_group_dismissals, and the planner
 * refuses any group containing one.
 *
 * Off unless CONTENT_AUTOLINK is "on" in the environment. That is the switch
 * for the backlog: turning it on is the moment existing posts get linked, so
 * it stays off until the preview has been reviewed.
 */

export function autoLinkEnabled(): boolean {
  return process.env.CONTENT_AUTOLINK === 'on';
}

/** Whether migration 013 has been applied. Without it there is nowhere to record how a link was made. */
export async function hasAutoColumns(): Promise<boolean> {
  const rows = await sql`
    SELECT COUNT(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'content_group_members' AND column_name IN ('linked_by', 'evidence'))
        OR (table_name = 'content_group_dismissals' AND column_name = 'reason')
        OR (table_name = 'profile_posts' AND column_name = 'cross_posted'))`;
  return Number(rows[0]?.n) === 4;
}

export const MATCH_OPTIONS = {
  toleranceHours: THRESHOLDS.autoLinkToleranceHours,
  minCaption: THRESHOLDS.autoLinkMinCaption,
};

/** Every post that could be a copy: not a story, not a Page cover or profile photo change. */
export async function loadMatchPosts(withMarker: boolean): Promise<MatchPost[]> {
  const rows = await sql(`
    SELECT p.id, p.platform, to_char(p.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS published_at,
           p.caption, pp.caption_complete, ${withMarker ? 'pp.cross_posted' : 'NULL::boolean'} AS cross_posted
    FROM posts p LEFT JOIN profile_posts pp ON pp.post_id = p.id
    WHERE p.format IS DISTINCT FROM 'story' AND p.published_at IS NOT NULL AND p.page_update IS NULL
      AND p.platform IN ('instagram', 'facebook', 'facebook-personal')
      AND (p.platform <> 'facebook-personal' OR pp.kind = 'post')`);
  return rows as unknown as MatchPost[];
}

export type AutoLinkReport =
  | { ran: false; reason: string }
  | { ran: true; groupsCreated: number; postsLinked: number; excluded: number; links: PlannedLink[]; skipped: Excluded[] };

/** Plans, and with `apply` writes. Without it nothing is written, which is the preview. */
export async function runAutoLink(apply: boolean): Promise<AutoLinkReport> {
  if (!(await hasAutoColumns())) return { ran: false, reason: 'Migration 013 has not been applied' };

  const posts = await loadMatchPosts(true);
  const groupOf = new Map<number, number>();
  for (const r of await sql`SELECT post_id, group_id FROM content_group_members`) groupOf.set(r.post_id as number, r.group_id as number);
  const rejected = new Set<string>();
  for (const r of await sql`SELECT post_a, post_b FROM content_group_dismissals`) rejected.add(`${r.post_a}-${r.post_b}`);

  const { links, excluded } = planAutoLinks(posts, groupOf, rejected, MATCH_OPTIONS);
  let groupsCreated = 0;
  let postsLinked = 0;
  if (apply) {
    for (const link of links) {
      let groupId = link.groupId;
      if (groupId === null) {
        const made = await sql`INSERT INTO content_groups DEFAULT VALUES RETURNING id`;
        groupId = made[0].id as number;
        groupsCreated += 1;
      }
      // ON CONFLICT DO NOTHING: a post linked by hand between the plan and
      // this write keeps the link Liz gave it.
      const written = await sql(
        `INSERT INTO content_group_members (post_id, group_id, linked_by, evidence)
         SELECT id, $1, 'auto', $2::jsonb FROM posts WHERE id = ANY($3::int[])
         ON CONFLICT (post_id) DO NOTHING RETURNING post_id`,
        [groupId, JSON.stringify(link.evidence), link.add]
      );
      postsLinked += written.length;
    }
  }
  return { ran: true, groupsCreated, postsLinked, excluded: excluded.length, links, skipped: excluded };
}

/**
 * The call the ingestion routes make. Never throws: matching failing must not
 * turn a successful ingestion into a failed one. The outcome is returned so
 * the route can report it.
 */
export async function autoLinkAfterIngestion(): Promise<{ status: string; groupsCreated?: number; postsLinked?: number }> {
  if (!autoLinkEnabled()) return { status: 'off: CONTENT_AUTOLINK is not on' };
  try {
    const r = await runAutoLink(true);
    if (!r.ran) return { status: `skipped: ${r.reason}` };
    return { status: 'ran', groupsCreated: r.groupsCreated, postsLinked: r.postsLinked };
  } catch (e) {
    return { status: `failed: ${e instanceof Error ? e.message : 'unknown error'}` };
  }
}
