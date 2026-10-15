import { NextRequest, NextResponse } from 'next/server';
import { authUrl, ytAnalyticsConfig } from '@/lib/ytanalytics';
import { newPkce, newState } from '@/lib/ytoken';

export const dynamic = 'force-dynamic';

/**
 * Starts the Google consent for YouTube Analytics. Signed-in only: the
 * middleware guards /dashboard and /admin, not /api, so the session is
 * checked here, as /api/thumb does.
 *
 * The state and the PKCE verifier go in a short-lived httpOnly cookie scoped
 * to the OAuth routes. The browser never sees a token, only Google's consent
 * page and, after it, the admin screen.
 */
const OAUTH_COOKIE = 'yt_oauth';

function signedIn(request: NextRequest): boolean {
  const expected = process.env.SESSION_SECRET;
  return !!expected && request.cookies.get('analytics_auth')?.value === expected;
}

export async function GET(request: NextRequest) {
  if (!signedIn(request)) return NextResponse.redirect(new URL('/login?from=/admin/youtube', request.url));
  let cfg;
  try {
    cfg = ytAnalyticsConfig(process.env);
  } catch {
    // The admin screen names what is missing. Nothing is put in the address.
    return NextResponse.redirect(new URL('/admin/youtube?result=config', request.url));
  }
  const state = newState();
  const { verifier, challenge } = newPkce();
  const res = NextResponse.redirect(authUrl(cfg, state, challenge));
  res.cookies.set(OAUTH_COOKIE, `${state}.${verifier}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/youtube/oauth',
    maxAge: 600,
  });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
