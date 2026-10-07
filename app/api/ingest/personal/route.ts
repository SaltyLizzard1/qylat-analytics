import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ingestAuthorized } from '@/lib/ingest-auth';
import { buildStatements, findCollection, payloadHash, validatePayload } from '@/lib/personal-ingest';
import { autoLinkAfterIngestion, hasAutoColumns } from '@/lib/autolink';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * One collection from the personal Facebook profile scraper in
 * scripts/personal-fb. The rules and the SQL live in lib/personal-ingest.ts.
 *
 * A payload is written completely or not at all: it is validated in full
 * first, and every statement runs in one transaction.
 */

export async function POST(request: NextRequest) {
  if (!ingestAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized. Set PERSONAL_INGEST_SECRET and send it as a bearer token.' },
      { status: 401 }
    );
  }

  const rawBody = await request.text();
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: 'Body is not JSON.' }, { status: 400 });
  }

  const checked = validatePayload(body);
  if ('errors' in checked) {
    return NextResponse.json(
      { ok: false, error: 'Payload refused. Nothing was written.', errors: checked.errors.slice(0, 50) },
      { status: 422 }
    );
  }
  const payload = checked.payload;
  const hash = payloadHash(rawBody);

  // The same run delivered again is a retry and writes nothing. The same ID
  // with a different body is not a retry and is refused. Null when this
  // collection has not been stored.
  const earlierDelivery = async (): Promise<NextResponse | null> => {
    const lookup = findCollection(payload.collection_id);
    const earlier = await sql(lookup.text, lookup.params);
    if (earlier.length === 0) return null;
    if ((earlier[0].payload_hash as string).trim() === hash) {
      return NextResponse.json({ ok: true, retry: true, collection_id: payload.collection_id, written: null });
    }
    return NextResponse.json(
      { ok: false, error: 'This collection_id was already stored with a different payload. Nothing was written.' },
      { status: 409 }
    );
  };

  try {
    const answered = await earlierDelivery();
    if (answered) return answered;

    const statements = buildStatements(payload, hash, { crossPosted: await hasAutoColumns() });
    const results = await sql.transaction(statements.map((s) => sql(s.text, s.params)));

    // The collection is stored. Matching runs now, in this request, and can
    // never undo or fail what was just written.
    const matching = await autoLinkAfterIngestion();

    const sentFollowers = payload.followers !== null;
    const audienceRows = sentFollowers ? (results[results.length - 1] as unknown[]) : [];
    const followers = !sentFollowers
      ? 'not sent'
      : audienceRows.length > 0
        ? 'written'
        : `skipped: ${payload.collected_on} already has a manual or api row, which was left as it is`;

    return NextResponse.json({
      ok: true,
      retry: false,
      collection_id: payload.collection_id,
      written: {
        posts: payload.posts.length,
        observations: payload.observations.length,
        followers,
      },
      sources: {
        timeline: payload.sources.timeline.status,
        library: payload.sources.library.status,
        audience: payload.sources.audience.status,
      },
      unmatched: payload.unmatched,
      matching,
    });
  } catch (e) {
    // Two deliveries of one collection can both pass the lookup above before
    // either has written. The unique collection_id lets one through and fails
    // the other only once the first has committed, so looking again now gives
    // the loser the same answer a later retry would get: retry, or 409.
    if ((e as { code?: string }).code === '23505') {
      try {
        const answered = await earlierDelivery();
        if (answered) return answered;
      } catch {
        // Fall through and report the original failure.
      }
    }
    return NextResponse.json(
      {
        ok: false,
        error: 'Database write failed. The transaction was rolled back and nothing was written.',
        reason: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
