import { NextRequest, NextResponse } from 'next/server';
import {
  YT_ANALYTICS_SCOPES,
  authorizedChannel,
  exchangeCode,
  readDaily,
  revokeToken,
  ytAnalyticsConfig,
  type Fetcher,
} from '@/lib/ytanalytics';
import { hasAnalyticsTables, saveConnection } from '@/lib/ytanalytics-store';
import { sameSecret } from '@/lib/ytoken';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Where Google sends the browser back after consent. It checks, in order,
 * and stores nothing unless every check passes:
 *
 *   the session, and the state against the cookie set by /start
 *   the code exchanges for a refresh token (Google issues one only with
 *     offline access and fresh consent)
 *   both read-only scopes were granted, not only one
 *   the authorized channel is YOUTUBE_CHANNEL_ID, not another channel the
 *     same Google account manages
 *   one small Analytics report succeeds
 *
 * Any failure revokes what Google just issued, so a half-made grant does not
 * linger in the Google account. The browser is redirected to the admin
 * screen with a result word only. No token, code or Google message is put in
 * the address.
 */
const COOKIE = 'yt_oauth';

function signedIn(request: NextRequest): boolean {
  const expected = process.env.SESSION_SECRET;
  return !!expected && request.cookies.get('analytics_auth')?.value === expected;
}

function done(request: NextRequest, result: string): NextResponse {
  const res = NextResponse.redirect(new URL(`/admin/youtube?result=${result}`, request.url));
  res.cookies.set(COOKIE, '', { httpOnly: true, path: '/api/youtube/oauth', maxAge: 0 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function GET(request: NextRequest) {
  if (!signedIn(request)) return NextResponse.redirect(new URL('/login?from=/admin/youtube', request.url));
  const p = request.nextUrl.searchParams;
  const [state, verifier] = (request.cookies.get(COOKIE)?.value ?? '').split('.');
  if (!state || !verifier || !sameSecret(state, p.get('state') ?? '')) return done(request, 'state');
  if (p.get('error')) return done(request, p.get('error') === 'access_denied' ? 'denied' : 'google-error');
  const code = p.get('code');
  if (!code) return done(request, 'google-error');
  if (!(await hasAnalyticsTables())) return done(request, 'migration');

  const cfg = ytAnalyticsConfig(process.env);
  const fetcher: Fetcher = (url, init) => fetch(url, { ...init, cache: 'no-store' });

  let issued: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    issued = await exchangeCode(cfg, fetcher, code, verifier);
  } catch (e) {
    console.error('YouTube OAuth: code exchange failed:', e instanceof Error ? e.message : 'unknown');
    return done(request, 'exchange');
  }
  const revokeIssued = () => revokeToken(cfg, fetcher, issued.refreshToken ?? issued.accessToken);

  if (!issued.refreshToken) {
    await revokeIssued();
    return done(request, 'no-refresh');
  }
  if (!YT_ANALYTICS_SCOPES.every((s) => issued.scopes.includes(s))) {
    await revokeIssued();
    return done(request, 'scopes');
  }
  try {
    const channel = await authorizedChannel(cfg, fetcher, issued.accessToken);
    if (!channel || channel.id !== cfg.channelId) {
      await revokeIssued();
      return done(request, 'wrong-channel');
    }
    // One day's report proves the Analytics API is enabled and readable.
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    await readDaily(cfg, fetcher, issued.accessToken, weekAgo, today);
    await saveConnection({ channelId: channel.id, channelTitle: channel.title, refreshToken: issued.refreshToken, scopes: issued.scopes });
  } catch (e) {
    console.error('YouTube OAuth: verification failed:', e instanceof Error ? e.message : 'unknown');
    await revokeIssued();
    return done(request, 'verify');
  }
  return done(request, 'connected');
}
