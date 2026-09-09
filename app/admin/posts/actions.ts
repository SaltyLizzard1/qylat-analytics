'use server';

import { sql } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { slugify } from '@/lib/utm';

export type SetThemeState =
  | { status: 'idle' }
  | { status: 'saved'; theme: string | null }
  | { status: 'error'; message: string };

/**
 * Sets or clears the content theme on one post.
 *
 * Themes are slugified so that "Thailand 60 Days" typed here matches
 * "thailand-60-days" set on a /go/ link. The theme pages join the two sides on
 * this exact string, so any drift in casing or spacing would silently split a
 * theme into two rows.
 */
export async function setPostTheme(
  _prev: SetThemeState,
  formData: FormData
): Promise<SetThemeState> {
  const postId = Number(formData.get('post_id'));
  const raw = ((formData.get('theme') as string) ?? '').trim();

  if (!Number.isInteger(postId) || postId <= 0) {
    return { status: 'error', message: 'Invalid post.' };
  }

  const theme = raw ? slugify(raw) : null;

  if (raw && !theme) {
    return { status: 'error', message: 'That theme has no usable characters.' };
  }

  try {
    const rows = await sql`
      UPDATE posts SET content_theme = ${theme} WHERE id = ${postId} RETURNING id
    `;
    if (rows.length === 0) {
      return { status: 'error', message: 'Post not found.' };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('DB error setting post theme:', e);
    return { status: 'error', message: `Could not save: ${message}` };
  }

  revalidatePath('/admin/posts');
  revalidatePath('/dashboard/themes');

  return { status: 'saved', theme };
}
