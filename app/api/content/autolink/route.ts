import { NextRequest, NextResponse } from 'next/server';
import { applyReviewed, previewAutoLink } from '@/lib/autolink';

export const dynamic = 'force-dynamic';

/**
 * The reviewed backlog run for automatic linking.
 *
 *   GET   what the matcher would link now. Reads only.
 *   POST  { "groups": [[post ids], [post ids], ...] }
 *         applies exactly those groups, and only where the matcher still
 *         proposes exactly that set. Anything else is refused and reported.
 *
 * This is the only way posts older than CONTENT_AUTOLINK_SINCE are ever
 * linked automatically. It is not on a schedule and nothing calls it: it is
 * run by hand, once, with the list from a preview Liz has read. Guarded by
 * CRON_SECRET as a bearer token, like the sync routes.
 */

const MAX_GROUPS = 200;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
}

const refuse = () => NextResponse.json({ ok: false, error: 'Unauthorized. Send CRON_SECRET as a bearer token.' }, { status: 401 });

export async function GET(request: NextRequest) {
  if (!authorized(request)) return refuse();
  const preview = await previewAutoLink();
  return NextResponse.json({ ok: true, preview });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return refuse();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Body is not JSON.' }, { status: 400 });
  }
  const groups = (body as { groups?: unknown }).groups;
  const valid =
    Array.isArray(groups) &&
    groups.length > 0 &&
    groups.length <= MAX_GROUPS &&
    groups.every((g) => Array.isArray(g) && g.length >= 2 && g.length <= 3 && g.every((id) => Number.isInteger(id) && id > 0));
  if (!valid) {
    return NextResponse.json(
      { ok: false, error: `groups must be 1 to ${MAX_GROUPS} lists of 2 or 3 post ids. Nothing was linked.` },
      { status: 422 }
    );
  }
  const result = await applyReviewed(groups as number[][]);
  if ('error' in result) return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true, ...result });
}
