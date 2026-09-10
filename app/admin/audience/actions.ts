'use server';

import { sql } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export type AudienceEntryState =
  | { status: 'idle' }
  | { status: 'saved'; platform: string; followers: number }
  | { status: 'error'; message: string };

const ALLOWED = new Set(['instagram', 'facebook', 'facebook-personal', 'tiktok', 'youtube']);

const LABEL: Record<string, string> = {
  instagram: 'QYLAT Instagram',
  facebook: 'QYLAT Facebook Page',
  'facebook-personal': 'Liz personal Facebook',
  tiktok: 'QYLAT TikTok',
  youtube: 'QYLAT YouTube',
};

/**
 * Records a follower count typed in by hand.
 *
 * Saved with source = 'manual', which the Meta sync refuses to overwrite. That
 * matters most for the personal Facebook profile, which no API can see and
 * which would otherwise be silently replaced by a null on the next run.
 */
export async function saveAudienceEntry(
  _prev: AudienceEntryState,
  formData: FormData
): Promise<AudienceEntryState> {
  const platform = ((formData.get('platform') as string) ?? '').trim();
  const followersRaw = ((formData.get('followers') as string) ?? '').trim();
  const dateRaw = ((formData.get('recorded_on') as string) ?? '').trim();

  if (!ALLOWED.has(platform)) {
    return { status: 'error', message: 'Pick an account.' };
  }

  const followers = Number(followersRaw);
  if (!Number.isInteger(followers) || followers < 0) {
    return { status: 'error', message: 'Follower count must be a whole number, zero or more.' };
  }

  // Default to today, and refuse a future date rather than storing one.
  const recordedOn = dateRaw || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedOn)) {
    return { status: 'error', message: 'Date must be YYYY-MM-DD.' };
  }
  if (recordedOn > new Date().toISOString().slice(0, 10)) {
    return { status: 'error', message: 'That date is in the future.' };
  }

  try {
    await sql`
      INSERT INTO audience_snapshots (recorded_on, platform, account_label, followers, source)
      VALUES (${recordedOn}::date, ${platform}, ${LABEL[platform] ?? platform}, ${followers}, 'manual')
      ON CONFLICT (platform, recorded_on) DO UPDATE SET
        followers     = EXCLUDED.followers,
        account_label = EXCLUDED.account_label,
        source        = 'manual'
    `;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('DB error saving audience entry:', e);
    return { status: 'error', message: `Could not save: ${message}` };
  }

  revalidatePath('/admin/audience');
  revalidatePath('/dashboard/audience');

  return { status: 'saved', platform, followers };
}

export async function deleteAudienceEntry(
  _prev: AudienceEntryState,
  formData: FormData
): Promise<AudienceEntryState> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return { status: 'error', message: 'Invalid entry.' };
  }

  try {
    // Manual rows only. An API row deleted here would just reappear.
    await sql`DELETE FROM audience_snapshots WHERE id = ${id} AND source = 'manual'`;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('DB error deleting audience entry:', e);
    return { status: 'error', message: `Could not delete: ${message}` };
  }

  revalidatePath('/admin/audience');
  revalidatePath('/dashboard/audience');
  return { status: 'idle' };
}
