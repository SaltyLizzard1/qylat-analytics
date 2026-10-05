import { NextRequest, NextResponse } from 'next/server';
import { freshThumbnail } from '@/lib/thumbs';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * Redirects to a working thumbnail for one post. A page's image falls back to
 * this only after its stored link has failed, so most images never touch it.
 * See lib/thumbs.ts for why stored links fail and how the new one is cached.
 *
 * The middleware guards /dashboard and /admin, not /api, so the same session
 * check is made here. Without it this would hand out post images to anyone.
 */
function signedIn(request: NextRequest): boolean {
  const expected = process.env.SESSION_SECRET;
  return !!expected && request.cookies.get('analytics_auth')?.value === expected;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!signedIn(request)) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) return new NextResponse(null, { status: 400 });

  let url: string | null;
  try {
    url = await freshThumbnail(Number(id));
  } catch (e) {
    // Temporary. Said plainly and not cached, so the next view tries again.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (!url) {
    return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'private, max-age=3600' } });
  }

  // The browser keeps the redirect for an hour, so scrolling back up a list
  // does not ask again.
  return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'private, max-age=3600' } });
}
