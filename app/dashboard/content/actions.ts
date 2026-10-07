'use server';

import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import { hasGroupTables } from '@/lib/combined';
import { platformLabel } from '@/lib/theme';

export type GroupState = { status: 'idle' } | { status: 'done'; message: string } | { status: 'error'; message: string };

/**
 * Link, unlink, or dismiss a suggested match. The only writes this feature
 * makes, and they touch only the three tables from migration 012: a post, its
 * figures and its observations are never written.
 *
 *   op=link     a, b   put two posts in one group, joining groups if needed
 *   op=unlink   a      take one post out of its group
 *   op=dismiss  a, b   stop suggesting this pair
 *
 * Every refusal comes back as a message. Nothing is retried or swallowed.
 */
export async function groupAction(_prev: GroupState, formData: FormData): Promise<GroupState> {
  const op = String(formData.get('op') ?? '');
  const a = Number(formData.get('a'));
  const b = Number(formData.get('b'));
  const valid = (n: number) => Number.isInteger(n) && n > 0;

  try {
    if (!(await hasGroupTables())) {
      return { status: 'error', message: 'Linking is off: migration 012 has not been applied to this database.' };
    }

    if (op === 'unlink') {
      if (!valid(a)) return { status: 'error', message: 'Invalid post.' };
      const gone = await sql`DELETE FROM content_group_members WHERE post_id = ${a} RETURNING group_id`;
      if (gone.length === 0) return { status: 'error', message: 'That post is not linked to anything.' };
      const groupId = gone[0].group_id as number;
      // A group of one is not a group. The last post goes back to standing alone.
      const left = await sql`SELECT COUNT(*)::int AS n FROM content_group_members WHERE group_id = ${groupId}`;
      if (Number(left[0].n) < 2) await sql`DELETE FROM content_groups WHERE id = ${groupId}`;
      revalidatePath('/dashboard/content', 'layout');
      return { status: 'done', message: 'Unlinked' };
    }

    if (!valid(a) || !valid(b) || a === b) return { status: 'error', message: 'Pick two different posts.' };
    const [lo, hi] = a < b ? [a, b] : [b, a];

    if (op === 'dismiss') {
      await sql`INSERT INTO content_group_dismissals (post_a, post_b) VALUES (${lo}, ${hi}) ON CONFLICT DO NOTHING`;
      revalidatePath('/dashboard/content', 'layout');
      return { status: 'done', message: 'Will not be suggested again' };
    }

    if (op === 'link') {
      const posts = await sql`
        SELECT p.id, p.platform, p.format, m.group_id
        FROM posts p LEFT JOIN content_group_members m ON m.post_id = p.id
        WHERE p.id IN (${a}, ${b})`;
      if (posts.length !== 2) return { status: 'error', message: 'One of those posts no longer exists.' };
      if (posts.some((p) => p.format === 'story')) return { status: 'error', message: 'Stories are not linked: they are not counted as posts.' };
      const ga = posts.find((p) => p.id === a)?.group_id as number | null;
      const gb = posts.find((p) => p.id === b)?.group_id as number | null;
      if (ga !== null && ga === gb) return { status: 'done', message: 'Already linked' };

      // One post per account in a group, so an account's figure is one
      // post's figure and never a sum of two.
      const members = await sql`
        SELECT p.id, p.platform FROM posts p
        WHERE p.id IN (${a}, ${b})
           OR p.id IN (SELECT post_id FROM content_group_members WHERE group_id IN (${ga ?? -1}, ${gb ?? -1}))`;
      const seen = new Set<string>();
      for (const m of members) {
        if (seen.has(m.platform as string)) {
          return {
            status: 'error',
            message: `Not linked: that would put two ${platformLabel(m.platform as string)} posts in one group. Unlink one first.`,
          };
        }
        seen.add(m.platform as string);
      }

      let groupId = ga ?? gb;
      if (groupId === null) {
        const made = await sql`INSERT INTO content_groups DEFAULT VALUES RETURNING id`;
        groupId = made[0].id as number;
      }
      if (ga !== null && gb !== null) {
        await sql`UPDATE content_group_members SET group_id = ${ga} WHERE group_id = ${gb}`;
        await sql`DELETE FROM content_groups WHERE id = ${gb}`;
        groupId = ga;
      }
      await sql`
        INSERT INTO content_group_members (post_id, group_id)
        SELECT id, ${groupId} FROM posts WHERE id IN (${a}, ${b})
        ON CONFLICT (post_id) DO UPDATE SET group_id = EXCLUDED.group_id`;
      await sql`DELETE FROM content_group_dismissals WHERE post_a = ${lo} AND post_b = ${hi}`;
      revalidatePath('/dashboard/content', 'layout');
      return { status: 'done', message: 'Linked' };
    }

    return { status: 'error', message: 'Unknown action.' };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'The change could not be saved.' };
  }
}
