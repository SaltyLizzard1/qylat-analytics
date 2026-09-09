'use server';

import { sql } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export type DeleteLinkState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success' };

export async function deleteLink(
  _prev: DeleteLinkState,
  slug: string
): Promise<DeleteLinkState> {
  if (!slug?.trim()) {
    return { status: 'error', message: 'Invalid slug.' };
  }

  try {
    await sql`DELETE FROM links WHERE slug = ${slug}`;
    revalidatePath('/admin/links');
    return { status: 'success' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('DB error deleting link:', e);
    return { status: 'error', message: 'Could not delete link. Try again.' };
  }
}
