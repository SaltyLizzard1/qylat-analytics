import type { NextRequest } from 'next/server';

/**
 * The personal profile scraper has its own secret rather than CRON_SECRET, so
 * the file that sits beside a browser session on a laptop cannot trigger the
 * Meta or GA sync. Every route the laptop calls checks it here.
 */
export function ingestAuthorized(request: NextRequest): boolean {
  const secret = process.env.PERSONAL_INGEST_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}
