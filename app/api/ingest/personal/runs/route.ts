import { NextRequest, NextResponse } from 'next/server';
import { ingestAuthorized } from '@/lib/ingest-auth';
import { claimRunRequest, finishRunRequest } from '@/lib/profile-runs';

export const dynamic = 'force-dynamic';

const DETAIL_MAX = 4000;

/**
 * The laptop's collector, scripts/personal-fb/collect.py, calls this when the
 * Sync page's button opens it.
 *
 *   { "action": "claim" }                                   -> { ok, request: { id } | null }
 *   { "action": "finish", "id": 1, "exit_code": 0, "detail": "..." }  -> { ok }
 *
 * Same secret as /api/ingest/personal. A claim with nothing waiting does not
 * touch the database; see lib/profile-runs.ts.
 */
export async function POST(request: NextRequest) {
  if (!ingestAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized. Set PERSONAL_INGEST_SECRET and send it as a bearer token.' },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Body is not a JSON object.' }, { status: 400 });
  }

  try {
    if (body.action === 'claim') {
      return NextResponse.json({ ok: true, request: await claimRunRequest() });
    }

    if (body.action === 'finish') {
      const { id, exit_code: exitCode, detail } = body;
      if (!Number.isInteger(id) || !Number.isInteger(exitCode)) {
        return NextResponse.json({ ok: false, error: 'id and exit_code must be integers.' }, { status: 422 });
      }
      const text = typeof detail === 'string' ? detail.slice(-DETAIL_MAX) : '';
      const recorded = await finishRunRequest(id as number, exitCode as number, text);
      return recorded
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ ok: false, error: `Request ${id} was never claimed, or already has a result.` }, { status: 409 });
    }

    return NextResponse.json({ ok: false, error: 'action must be claim or finish.' }, { status: 422 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: 'Database error.', reason: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
