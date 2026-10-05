import { neon } from '@neondatabase/serverless';

/**
 * TEST ONLY, DO NOT MERGE. On a Vercel preview, PREVIEW_TEST_DATABASE_URL wins
 * over DATABASE_URL. The Neon integration sets DATABASE_URL for every
 * environment, and a branch-specific value of the same name did not override
 * it, so the hydration previews read production until this was added.
 */
const url =
  process.env.VERCEL_ENV === 'preview' && process.env.PREVIEW_TEST_DATABASE_URL
    ? process.env.PREVIEW_TEST_DATABASE_URL
    : process.env.DATABASE_URL;

if (!url) {
  throw new Error('DATABASE_URL is not set');
}

export const sql = neon(url);

/** Host and database name only. Never the connection string. */
export function databaseTarget(): { host: string; database: string; source: string } {
  const u = new URL(url as string);
  return {
    host: u.hostname.split('.')[0],
    database: u.pathname.replace(/^\//, ''),
    source: url === process.env.DATABASE_URL ? 'DATABASE_URL' : 'PREVIEW_TEST_DATABASE_URL',
  };
}
