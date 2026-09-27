import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { recordClickFailure } from '@/lib/clicks';

/**
 * The /go/ redirect, and the only place a click is written.
 *
 * Two things changed here on 2026-09-27.
 *
 * 1. This handler no longer classifies anything. It stores the raw request and
 *    the database classifies it, through the BEFORE INSERT trigger added in
 *    db/migrations/008_click_classification.sql. Classification used to be
 *    computed here from lib/bots.ts and frozen into a boolean at insert, which
 *    meant a rule change could never be applied to history and the totals moved
 *    with no explanation. Now the raw user agent is the stored fact and the
 *    classification is derived from it, so reclassifying gives the same answer
 *    the insert would give today.
 *
 * 2. It is a catch all rather than a single segment. www.quityourlifeandtravel
 *    .com/go/:slug reaches this file through a rewrite in qylat-next. That
 *    rewrite used to match exactly one segment, so /go/a/b fell through to the
 *    QYLAT site's own 404 page, which carries the GA4 tag. The result was a GA4
 *    page view at a /go/ path with no click row anywhere and no error: exactly
 *    what happened to /go/fb-page-quiz on 23 Aug. Extra segments now arrive
 *    here and are recorded as a malformed_path failure.
 *
 * The rule the whole file serves: every hit either redirects and logs, or logs
 * an explicit error. Nothing is ever swallowed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug: segments } = await params;
  const path = `/go/${(segments ?? []).join('/')}`;
  const slug = segments?.[0] ?? '';

  if (!slug) {
    await recordClickFailure({
      slug: null,
      path,
      reason: 'unknown_slug',
      detail: 'No slug segment in the path.',
    });
    return new NextResponse('Link not found', { status: 404 });
  }

  // Extra path segments mean the link that produced this hit is malformed,
  // usually a relative href resolving against the wrong base. The person still
  // gets where they were going, and the broken link is recorded rather than
  // disappearing into a 404.
  if (segments.length > 1) {
    await recordClickFailure({
      slug,
      path,
      reason: 'malformed_path',
      detail: `Expected /go/<slug>, got ${segments.length} segments. The link that produced this hit is built wrong.`,
    });
  }

  let destination: string;
  try {
    const rows = await sql`
      SELECT destination_url, utm_url FROM links WHERE slug = ${slug}
    `;

    if (rows.length === 0) {
      await recordClickFailure({
        slug,
        path,
        reason: 'unknown_slug',
        detail: 'No row in links for this slug. The hit was not counted.',
      });
      return new NextResponse('Link not found', { status: 404 });
    }

    destination = (rows[0].utm_url as string) || (rows[0].destination_url as string);
  } catch (e) {
    // The lookup itself failed, so there is no destination to send anyone to.
    // A 404 would be a lie, so say what actually happened.
    await recordClickFailure({
      slug,
      path,
      reason: 'lookup_failed',
      detail: e instanceof Error ? e.message : String(e),
    });
    return new NextResponse('Link lookup failed', { status: 503 });
  }

  // Read or create the first party session cookie. It is what links a series
  // of hits to one browser, which is how a test click gets recognised.
  const existingSession = request.cookies.get('qylat_session')?.value;
  const sessionId = existingSession ?? crypto.randomUUID();

  // The raw request is the stored fact. classification, rules_version and
  // is_test are all set by the database trigger.
  try {
    await sql`
      INSERT INTO click_events (slug, referrer, user_agent, country, session_id)
      VALUES (
        ${slug},
        ${request.headers.get('referer')},
        ${request.headers.get('user-agent')},
        ${request.headers.get('x-vercel-ip-country')},
        ${sessionId}
      )
    `;
  } catch (e) {
    // The redirect still happens. A person clicking a link must reach the
    // destination whatever the database is doing. But the click is not lost
    // quietly: recordClickFailure writes the slug, the timestamp and the error
    // to click_failures and to the console, and the Click Log shows it.
    await recordClickFailure({
      slug,
      path,
      reason: 'insert_failed',
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  const response = NextResponse.redirect(destination, { status: 302 });
  response.headers.set('Cache-Control', 'no-store');

  if (!existingSession) {
    response.cookies.set('qylat_session', sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
  }

  return response;
}
