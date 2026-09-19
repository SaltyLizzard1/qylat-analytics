import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { isBotUserAgent } from '@/lib/bots';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const rows = await sql`
    SELECT destination_url, utm_url FROM links WHERE slug = ${slug}
  `;

  if (rows.length === 0) {
    return new NextResponse('Link not found', { status: 404 });
  }

  const destination = rows[0].utm_url || rows[0].destination_url;

  // Read or create session cookie
  const existingSession = request.cookies.get('qylat_session')?.value;
  const sessionId = existingSession ?? crypto.randomUUID();

  // Crawlers are logged and redirected like anyone else, since a link preview
  // needs the destination. The flag keeps them out of every click figure.
  const userAgent = request.headers.get('user-agent');
  const isBot = isBotUserAgent(userAgent);

  // Log the click
  try {
    await sql`
      INSERT INTO click_events (slug, referrer, user_agent, country, session_id, is_bot)
      VALUES (
        ${slug},
        ${request.headers.get('referer')},
        ${userAgent},
        ${request.headers.get('x-vercel-ip-country')},
        ${sessionId},
        ${isBot}
      )
    `;
  } catch (e) {
    console.error('click log failed:', e);
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
