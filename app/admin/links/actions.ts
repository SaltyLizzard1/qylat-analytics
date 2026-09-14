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
 */
export async function deleteLink(
  _prev: DeleteLinkState,
  slug: string
): Promise<DeleteLinkState> {
  if (!slug?.trim()) {
    return { status: 'error', message: 'Invalid slug.' };
  }

  try {
    const counted = await sql`SELECT COUNT(*)::int AS n FROM click_events WHERE slug = ${slug}`;
    const clicks = (counted[0]?.n as number) ?? 0;
    if (clicks > 0) {
      return {
        status: 'error',
        message: `Not deleted. This link has ${clicks} recorded ${
          clicks === 1 ? 'click' : 'clicks'
        }, and deleting it would orphan that history. Links with clicks stay.`,
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
