'use server';

import { sql } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export type DeleteLinkState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success' };

/**
 * Delete a link, but never its click history.
 *
 * click_events.slug is a foreign key to links.slug with no cascade, so a
 * plain DELETE on a link that has been clicked fails at the database. That
 * is the right outcome: the clicks are the record of what happened, and a
 * link that earned them should not be able to take them with it. Rather than
 * let the constraint fail with a generic error, count first and say why.
 *
 * This counts click_events, not human_clicks, on purpose. The foreign key
 * covers crawler rows too, so a link the page shows at 0 clicks can still be
 * undeletable. The message splits the two so that does not read as a bug.
 */
export async function deleteLink(
  _prev: DeleteLinkState,
  slug: string
): Promise<DeleteLinkState> {
  if (!slug?.trim()) {
    return { status: 'error', message: 'Invalid slug.' };
  }

  try {
    const counted = await sql`
      SELECT COUNT(*) FILTER (WHERE NOT is_bot)::int AS humans,
             COUNT(*) FILTER (WHERE is_bot)::int     AS bots
      FROM click_events WHERE slug = ${slug}
    `;
    const humans = (counted[0]?.humans as number) ?? 0;
    const bots = (counted[0]?.bots as number) ?? 0;
    if (humans + bots > 0) {
      const parts: string[] = [];
      if (humans > 0) parts.push(`${humans} recorded ${humans === 1 ? 'click' : 'clicks'}`);
      if (bots > 0) parts.push(`${bots} logged crawler ${bots === 1 ? 'hit' : 'hits'}`);
      return {
        status: 'error',
        message: `Not deleted. This link has ${parts.join(' and ')}, and deleting it would orphan that history. Links with logged hits stay.`,
      };
    }

    await sql`DELETE FROM links WHERE slug = ${slug}`;
    revalidatePath('/admin/links');
    return { status: 'success' };
  } catch (e: unknown) {
    console.error('DB error deleting link:', e);
    return { status: 'error', message: 'Could not delete link. Try again.' };
  }
}
