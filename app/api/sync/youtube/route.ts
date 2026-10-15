import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { YOUTUBE_SOURCE, readChannel, youtubeConfig, type Fetcher, type Video, type YouTubeConfig } from '@/lib/youtube';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Reads the YouTube channel and stores what it finds. Its own route and its
 * own request: it shares nothing with /api/sync/meta, so it cannot use that
 * sync's time, delay its refresh queue, or fail it.
 *
 *   GET /api/sync/youtube            videos published in the last 30 days
 *   GET /api/sync/youtube?days=3650  a first import, or a backfill
 *
 * Videos linked into a content group are read again whatever their age, so
 * a combined total does not rest on a stale YouTube figure. That costs one
 * quota unit per 50 videos.
 *
 * Safe to run twice. A video is one row in posts, keyed by its YouTube id.
 * Its figures are one row per day in post_metrics, replaced by a later run
 * on the same day, exactly as the Meta sync does. Nothing here deletes.
 *
 * Guarded by CRON_SECRET as a bearer token, which Vercel's cron sends.
 *
 * Scheduled once a day in vercel.json as ?days=3650 at 09:00 UTC (16:00 in
 * Chiang Mai; Hobby runs it any time in that hour). The whole channel is in
 * the window, so every video is re-read every day, old ones included, and a
 * figure is never more than a day stale. At six videos that is five quota
 * units of 10,000. It is its own invocation, after the Meta sync at 08:00
 * and GA at 08:30, so it never spends their time or delays their queue.
 * The window stops covering everything past 1,000 uploads, the page cap in
 * lib/youtube.ts; linked older videos are still re-read by id.
 */

const DEFAULT_DAYS = 30;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
}

/** Whether migration 014 has been applied. */
async function hasYouTubeColumns(): Promise<boolean> {
  const rows = await sql`
    SELECT COUNT(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'posts' AND column_name IN ('title', 'duration_seconds'))
        OR (table_name = 'post_metrics' AND column_name IN ('source', 'scope')))`;
  return Number(rows[0]?.n) === 4;
}

const FORMAT: Record<Video['kind'], string> = { short: 'short', video: 'video', unclassified: 'other' };
const PRODUCT: Record<Video['kind'], string> = { short: 'YOUTUBE_SHORT', video: 'YOUTUBE_VIDEO', unclassified: 'YOUTUBE_UNCLASSIFIED' };

/** A null stays null. A sum is only made of the parts that exist. */
function sumDefined(...parts: (number | null)[]): number | null {
  const present = parts.filter((p): p is number => typeof p === 'number');
  return present.length > 0 ? present.reduce((a, b) => a + b, 0) : null;
}

async function store(video: Video): Promise<void> {
  // Title first, then the description, so every screen that shows the first
  // line of a caption shows the video's title.
  const caption = video.description ? `${video.title}\n\n${video.description}` : video.title;
  const rows = await sql`
    INSERT INTO posts (
      platform, platform_post_id, format, media_product_type, published_at,
      caption, title, duration_seconds, thumbnail_url, permalink, last_synced_at
    ) VALUES (
      'youtube', ${`youtube:${video.id}`}, ${FORMAT[video.kind]}, ${PRODUCT[video.kind]}, ${video.publishedAt || null},
      ${caption || null}, ${video.title || null}, ${video.durationSeconds}, ${video.thumbnailUrl}, ${video.url}, NOW()
    )
    ON CONFLICT (platform_post_id) DO UPDATE SET
      -- A video once seen in the Shorts or videos list keeps that label if a
      -- later run cannot read the lists. Evidence is not replaced by its absence.
      format             = CASE WHEN EXCLUDED.format = 'other' THEN posts.format ELSE EXCLUDED.format END,
      media_product_type = CASE WHEN EXCLUDED.format = 'other' THEN posts.media_product_type ELSE EXCLUDED.media_product_type END,
      published_at       = EXCLUDED.published_at,
      caption            = EXCLUDED.caption,
      title              = EXCLUDED.title,
      duration_seconds   = COALESCE(EXCLUDED.duration_seconds, posts.duration_seconds),
      thumbnail_url      = COALESCE(EXCLUDED.thumbnail_url, posts.thumbnail_url),
      permalink          = EXCLUDED.permalink,
      last_synced_at     = NOW()
    RETURNING id`;
  const postId = rows[0].id as number;
  await sql`
    INSERT INTO post_metrics (post_id, recorded_on, recorded_at, views, engagement, likes, comments, source, scope)
    VALUES (${postId}, CURRENT_DATE, NOW(), ${video.views}, ${sumDefined(video.likes, video.comments)},
            ${video.likes}, ${video.comments}, ${YOUTUBE_SOURCE}, 'lifetime')
    ON CONFLICT (post_id, recorded_on) DO UPDATE SET
      recorded_at = NOW(),
      views       = EXCLUDED.views,
      engagement  = EXCLUDED.engagement,
      likes       = EXCLUDED.likes,
      comments    = EXCLUDED.comments,
      source      = EXCLUDED.source,
      scope       = EXCLUDED.scope`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized. Set CRON_SECRET and send it as a bearer token.' }, { status: 401 });
  }
  let cfg: YouTubeConfig;
  try {
    cfg = youtubeConfig();
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'YouTube is not configured' }, { status: 500 });
  }
  if (!(await hasYouTubeColumns())) {
    return NextResponse.json({ ok: false, error: 'Migration 014 has not been applied. Nothing was read or written.' }, { status: 409 });
  }

  const daysParam = Number(request.nextUrl.searchParams.get('days'));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 3650) : DEFAULT_DAYS;
  const since = new Date(Date.now() - days * 86_400_000);
  const startedAt = new Date();

  // Linked videos older than the window, to keep combined totals fresh.
  const linked = await sql`
    SELECT p.platform_post_id FROM posts p
    WHERE p.platform = 'youtube' AND p.published_at < ${since.toISOString()}
      AND to_regclass('public.content_group_members') IS NOT NULL
      AND p.id IN (SELECT post_id FROM content_group_members)`.catch(() => []);
  const alsoIds = linked.map((r) => String(r.platform_post_id).replace(/^youtube:/, ''));

  const fetcher: Fetcher = (url) => fetch(url, { cache: 'no-store' });
  let read;
  try {
    read = await readChannel(cfg, fetcher, { since, alsoIds });
  } catch (e) {
    // Nothing has been written at this point. The message never includes the key.
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'YouTube could not be read' }, { status: 502 });
  }

  const errors: { video: string; reason: string }[] = [];
  let stored = 0;
  for (const video of read.videos) {
    try {
      await store(video);
      stored += 1;
    } catch (e) {
      errors.push({ video: video.id, reason: e instanceof Error ? e.message : 'not stored' });
    }
  }

  // The subscriber count. A hidden count writes nothing, so a day without a
  // figure stays a gap and is never a zero. A row typed in by hand is kept.
  let subscribers = 'hidden by the channel, nothing written';
  if (read.channel.subscribers !== null) {
    const row = await sql`
      INSERT INTO audience_snapshots (recorded_on, platform, account_label, followers, source)
      VALUES (CURRENT_DATE, 'youtube', ${read.channel.title || 'YouTube'}, ${read.channel.subscribers}, 'api')
      ON CONFLICT (platform, recorded_on) DO UPDATE SET
        followers = EXCLUDED.followers, account_label = EXCLUDED.account_label
      WHERE audience_snapshots.source = 'api'
      RETURNING id`;
    subscribers = row.length > 0 ? 'written' : 'skipped: today already has a row entered by hand, which was left as it is';
  }

  const kinds = { short: 0, video: 0, unclassified: 0 };
  for (const v of read.videos) kinds[v.kind] += 1;
  return NextResponse.json({
    ok: errors.length === 0,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    lookbackDays: days,
    channel: read.channel.title,
    videosRead: read.videos.length,
    videosStored: stored,
    linkedOlderVideosRefreshed: alsoIds.length,
    kinds,
    shortsListRead: read.shortsListRead,
    videosListRead: read.videosListRead,
    noLongerOnYouTube: read.missing,
    missingMetrics: {
      views: read.videos.filter((v) => v.views === null).length,
      likes: read.videos.filter((v) => v.likes === null).length,
      comments: read.videos.filter((v) => v.comments === null).length,
    },
    subscribers,
    quotaUnits: read.quotaUnits,
    errors,
  });
}
