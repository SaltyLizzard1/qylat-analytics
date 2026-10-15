'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { revokeToken, ytAnalyticsConfig, type Fetcher } from '@/lib/ytanalytics';
import { deleteEverything, hasAnalyticsTables, loadRefreshToken } from '@/lib/ytanalytics-store';

export type DisconnectState = { status: 'idle' } | { status: 'error'; message: string };

/**
 * Disconnects YouTube Analytics: revokes the grant at Google, then deletes
 * the stored token and every stored analytics row. The YouTube API Services
 * Developer Policies ask for that deletion within 7 days of an in-app
 * revocation; this does it at once.
 *
 * If Google does not confirm the revoke, the local data is still deleted,
 * and the result says so, because the grant may then still be listed at
 * myaccount.google.com/permissions and should be removed there.
 *
 * It ends on a redirect to the admin screen with a result word, because the
 * form that called it is no longer on the page once nothing is connected.
 */
export async function disconnectYouTube(_prev: DisconnectState, formData: FormData): Promise<DisconnectState> {
  if (formData.get('confirm') !== 'yes') return { status: 'error', message: 'Tick the box to confirm.' };
  if (!(await hasAnalyticsTables())) return { status: 'error', message: 'Migration 015 has not been applied.' };
  let revokedAtGoogle: boolean | null = null;
  try {
    const token = await loadRefreshToken();
    if (token) {
      const fetcher: Fetcher = (url, init) => fetch(url, { ...init, cache: 'no-store' });
      revokedAtGoogle = await revokeToken(ytAnalyticsConfig(process.env), fetcher, token);
    }
  } catch (e) {
    console.error('YouTube disconnect: revoke not attempted:', e instanceof Error ? e.message : 'unknown');
    revokedAtGoogle = false;
  }
  await deleteEverything();
  revalidatePath('/', 'layout');
  redirect(`/admin/youtube?result=${revokedAtGoogle === true ? 'disconnected' : revokedAtGoogle === false ? 'disconnected-unconfirmed' : 'disconnected-nothing'}`);
}
