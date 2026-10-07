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
 * Two switches, and neither one can link the backlog by itself:
 *
 *   CONTENT_AUTOLINK=on            turns matching on at all.
 *   CONTENT_AUTOLINK_SINCE=<date>  the matcher after an ingestion only makes
 *                                  a link that adds a post published on or
 *                                  after this date. Without a valid date it
 *                                  links nothing.
 *
 * So switching matching on never applies a group nobody looked at. Posts
 * older than the date are linked one way only: applyReviewed below, which
 * takes the exact groups from a preview Liz has read and refuses anything
 * that is not one of them.
 */

export function autoLinkEnabled(): boolean {
  return process.env.CONTENT_AUTOLINK === 'on';
}

/** The date future matching starts from, or null when it is missing or not a date. */
export function autoLinkSince(): Date | null {
  const raw = process.env.CONTENT_AUTOLINK_SINCE ?? '';
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
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

async function plan(): Promise<{ posts: MatchPost[]; links: PlannedLink[]; excluded: Excluded[] }> {
  const posts = await loadMatchPosts(true);
  const groupOf = new Map<number, number>();
  for (const r of await sql`SELECT post_id, group_id FROM content_group_members`) groupOf.set(r.post_id as number, r.group_id as number);
  const rejected = new Set<string>();
  for (const r of await sql`SELECT post_a, post_b FROM content_group_dismissals`) rejected.add(`${r.post_a}-${r.post_b}`);
  return { posts, ...planAutoLinks(posts, groupOf, rejected, MATCH_OPTIONS) };
}

async function write(links: PlannedLink[]): Promise<{ groupsCreated: number; postsLinked: number }> {
  let groupsCreated = 0;
  let postsLinked = 0;
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
  return { groupsCreated, postsLinked };
}

/** What the matcher would link right now. Reads only. */
export async function previewAutoLink(): Promise<AutoLinkReport> {
  if (!(await hasAutoColumns())) return { ran: false, reason: 'Migration 013 has not been applied' };
  const { links, excluded } = await plan();
  return { ran: true, groupsCreated: 0, postsLinked: 0, excluded: excluded.length, links, skipped: excluded };
}

/**
 * Links made after an ingestion: only those that add a post published on or
 * after `since`. Everything older is left for a reviewed backlog run.
 */
export async function runAutoLink(since: Date): Promise<AutoLinkReport> {
  if (!(await hasAutoColumns())) return { ran: false, reason: 'Migration 013 has not been applied' };
  const { posts, links, excluded } = await plan();
  const published = new Map(posts.map((p) => [p.id, new Date(p.published_at).getTime()]));
  const recent = links.filter((l) => l.add.some((id) => (published.get(id) ?? 0) >= since.getTime()));
  const done = await write(recent);
  return { ran: true, ...done, excluded: excluded.length, links: recent, skipped: excluded };
}

export type ReviewedResult = {
  applied: { members: number[]; added: number[] }[];
  refused: { members: number[]; reason: string }[];
  groupsCreated: number;
  postsLinked: number;
};

/**
 * The bounded backlog run. `reviewed` is the list of groups from a preview
 * Liz has read, each the full set of post ids the group would hold. The plan
 * is computed again now, and a reviewed group is applied only if the matcher
 * still proposes exactly that set. A group that has changed since the review,
 * or that the matcher would not make, is refused with the reason, and no
 * group outside the list is ever applied.
 */
export async function applyReviewed(reviewed: number[][]): Promise<ReviewedResult | { error: string }> {
  if (!(await hasAutoColumns())) return { error: 'Migration 013 has not been applied' };
  const key = (ids: number[]) => [...ids].sort((a, b) => a - b).join(',');
  const { links } = await plan();
  const planned = new Map(links.map((l) => [key(l.members), l]));
  const applying: PlannedLink[] = [];
  const refused: ReviewedResult['refused'] = [];
  const seen = new Set<string>();
  for (const members of reviewed) {
    const k = key(members);
    if (seen.has(k)) continue;
    seen.add(k);
    const link = planned.get(k);
    if (link) applying.push(link);
    else refused.push({ members, reason: 'The matcher does not propose exactly this group now. Nothing was linked for it' });
  }
  const done = await write(applying);
  return { applied: applying.map((l) => ({ members: l.members, added: l.add })), refused, ...done };
}

/**
 * The call the ingestion routes make. Never throws: matching failing must not
 * turn a successful ingestion into a failed one. The outcome is returned so
 * the route can report it.
 */
export async function autoLinkAfterIngestion(): Promise<{ status: string; groupsCreated?: number; postsLinked?: number }> {
  if (!autoLinkEnabled()) return { status: 'off: CONTENT_AUTOLINK is not on' };
  const since = autoLinkSince();
  if (!since) return { status: 'off: CONTENT_AUTOLINK_SINCE is not set to a date, so nothing is linked' };
  try {
    const r = await runAutoLink(since);
    if (!r.ran) return { status: `skipped: ${r.reason}` };
    return { status: `ran for posts published since ${since.toISOString().slice(0, 10)}`, groupsCreated: r.groupsCreated, postsLinked: r.postsLinked };
  } catch (e) {
    return { status: `failed: ${e instanceof Error ? e.message : 'unknown error'}` };
  }
}
