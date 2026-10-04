'use server';

import { openRunRequest } from '@/lib/profile-runs';

export type CollectState = { status: 'idle' } | { status: 'requested' } | { status: 'error'; message: string };

/**
 * Asks the laptop to collect the personal profile. Only writes a request: the
 * scraper runs on the laptop, which picks the request up on its next check.
 */
export async function requestProfileCollection(): Promise<CollectState> {
  try {
    const opened = await openRunRequest();
    return opened
      ? { status: 'requested' }
      : { status: 'error', message: 'A collection is already waiting or running. It shows below.' };
  } catch (e) {
    return {
      status: 'error',
      message: `The request could not be saved. Migration 011 may not have been run on this database. ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }
}
