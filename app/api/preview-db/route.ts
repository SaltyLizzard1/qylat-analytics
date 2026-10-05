import { NextRequest, NextResponse } from 'next/server';
import { databaseTarget, sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * TEST ONLY, DO NOT MERGE. Says which database a preview deployment reads, so
 * that can be confirmed before anything is tested against it. Answers only on
 * a Vercel preview and only to a signed-in session. Returns the host and
 * database name, never the connection string.
 */
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'preview') return new NextResponse(null, { status: 404 });
  const expected = process.env.SESSION_SECRET;
  if (!expected || request.cookies.get('analytics_auth')?.value !== expected) return new NextResponse(null, { status: 401 });

  const rows = await sql`
    SELECT current_database() AS database,
           (SELECT COUNT(*)::int FROM posts) AS posts,
           (SELECT COUNT(*)::int FROM posts WHERE caption LIKE 'Fixture %') AS fixture_posts,
           (SELECT COUNT(*)::int FROM profile_run_requests) AS run_requests
  `;
  return NextResponse.json({ target: databaseTarget(), connected: rows[0], branch: process.env.VERCEL_GIT_COMMIT_REF ?? null });
}
