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
 * click_events.slug is a foreign key to links.slug with no cascade, so a plain
 * DELETE on a link that has been clicked fails at the database. That is the
 * right outcome: the clicks are the record of what happened, and a link that
 * earned them should not be able to take them with it. Rather than let the
 * constraint fail with a generic error, count first and say why.
 *
 * This counts click_events, not human_clicks, on purpose. The foreign key
 * covers crawler, uncertain and test rows too, so a link the Links page shows
 * at 0 people can still be undeletable. The message breaks the total into the
 * same four states that page shows, so that never reads as a bug.
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
      SELECT
        COUNT(*) FILTER (WHERE NOT is_test AND classification = 'human')::int     AS humans,
        COUNT(*) FILTER (WHERE NOT is_test AND classification = 'uncertain')::int AS uncertain,
        COUNT(*) FILTER (WHERE NOT is_test AND classification = 'crawler')::int   AS crawlers,
        COUNT(*) FILTER (WHERE is_test)::int                                      AS tests,
        COUNT(*)::int                                                             AS total
      FROM click_events WHERE slug = ${slug}
    `;

    const humans = (counted[0]?.humans as number) ?? 0;
    const uncertain = (counted[0]?.uncertain as number) ?? 0;
    const crawlers = (counted[0]?.crawlers as number) ?? 0;
    const tests = (counted[0]?.tests as number) ?? 0;
    const total = (counted[0]?.total as number) ?? 0;

    if (total > 0) {
      const parts: string[] = [];
      if (humans > 0) parts.push(`${humans} from ${humans === 1 ? 'a person' : 'people'}`);
      if (uncertain > 0) parts.push(`${uncertain} uncertain`);
      if (crawlers > 0) parts.push(`${crawlers} crawler ${crawlers === 1 ? 'hit' : 'hits'}`);
      if (tests > 0) parts.push(`${tests} of your own ${tests === 1 ? 'test' : 'tests'}`);

      return {
        status: 'error',
        message: `Not deleted. This link has ${total} logged ${
          total === 1 ? 'hit' : 'hits'
        } (${parts.join(', ')}), and deleting it would orphan that history. Links with logged hits stay.`,
      };
    }

    await sql`DELETE FROM links WHERE slug = ${slug}`;
    revalidatePath('/admin/links');
    return { status: 'success' };
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`[delete-link-failed] slug=${slug} error=${detail}`);
    return { status: 'error', message: `Could not delete link: ${detail}` };
  }
}
