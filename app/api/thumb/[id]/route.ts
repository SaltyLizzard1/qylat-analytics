import { NextRequest, NextResponse } from 'next/server';
import { freshThumbnail } from '@/lib/thumbs';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * Redirects to a working thumbnail for one post. A page's image falls back to
 * this only after its stored link has failed, so most images never touch it.
 * See lib/thumbs.ts for why stored links fail, how the new one is cached, and
 * how repeated requests are limited when recovery fails.
 *
 * The middleware guards /dashboard and /admin, not /api, so the same session
 * check is made here. Without it this would hand out post images to anyone.
 *
 * Every answer carries Cache-Control, so the browser also holds off: an hour
 * for an image or a definite "none", and the server's own wait for a failure.
 * No answer carries a reason. Reasons are logged on the server.
 */
function signedIn(request: NextRequest): boolean {
  const expected = process.env.SESSION_SECRET;
  return !!expected && request.cookies.get('analytics_auth')?.value === expected;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!signedIn(request)) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) return new NextResponse(null, { status: 400 });

  const result = await freshThumbnail(Number(id));

  if (result.kind === 'url') {
    return NextResponse.redirect(result.url, { status: 302, headers: { 'Cache-Control': 'private, max-age=3600' } });
  }
  if (result.kind === 'none') {
    return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'private, max-age=3600' } });
  }
  return new NextResponse(null, {
    status: 503,
    headers: {
      'Retry-After': String(result.retryAfterSeconds),
      'Cache-Control': `private, max-age=${result.retryAfterSeconds}`,
    },
  });
}
