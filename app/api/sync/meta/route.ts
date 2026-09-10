import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
  metaConfig,
  errText,
  fetchFacebookPosts,
  fetchFacebookPostInsights,
  fetchInstagramMedia,
  fetchInstagramMediaInsights,
  instagramFormat,
  facebookFormat,
  facebookMediaType,
  fetchInstagramAudience,
  fetchPageAudience,
  fetchInstagramFollowerHistory,
  slugFromCaption,
  type MetaConfig,
  type InsightResult,
} from '@/lib/meta';

export const dynamic = 'force-dynamic';
// Vercel Hobby caps a function at 60s unless Fluid Compute is on. The daily
// cron runs a 7 day window to stay well inside that. Backfills go through a
// manual call with ?days=90, which needs Fluid Compute or a paid plan.
export const maxDuration = 60;

const DEFAULT_LOOKBACK_DAYS = 30;

type PlatformReport = {
  fetched: number;
  postsUpserted: number;
  metricsWritten: number;
  errors: { object: string; reason: string }[];
  metricsUnavailable: { object: string; metric: string; reason: string }[];
};

function emptyReport(): PlatformReport {
  return { fetched: 0, postsUpserted: 0, metricsWritten: 0, errors: [], metricsUnavailable: [] };
}

/**
 * Vercel cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is
 * set on the project. The same header works for a manual curl.
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

/** Inserts or updates the post row and returns its internal id. */
async function upsertPost(input: {
  platform: 'facebook' | 'instagram';
  platformPostId: string;
  format: string;
  mediaProductType: string | null;
  publishedAt: string;
  caption: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  linkSlug: string | null;
}): Promise<number> {
  const rows = await sql`
    INSERT INTO posts (
      platform, platform_post_id, format, media_product_type,
      published_at, caption, thumbnail_url, permalink, link_slug, last_synced_at
    )
    VALUES (
      ${input.platform}, ${input.platformPostId}, ${input.format}, ${input.mediaProductType},
      ${input.publishedAt}, ${input.caption}, ${input.thumbnailUrl}, ${input.permalink},
      ${input.linkSlug}, NOW()
    )
    ON CONFLICT (platform_post_id) DO UPDATE SET
      format             = EXCLUDED.format,
      media_product_type = EXCLUDED.media_product_type,
      published_at       = EXCLUDED.published_at,
      caption            = EXCLUDED.caption,
      thumbnail_url      = EXCLUDED.thumbnail_url,
      permalink          = EXCLUDED.permalink,
      -- Never clear a link_slug that was set by hand.
      link_slug          = COALESCE(EXCLUDED.link_slug, posts.link_slug),
      last_synced_at     = NOW()
    RETURNING id
  `;
  return rows[0].id as number;
}

/** Writes one metrics snapshot for today, replacing an earlier run on the same day. */
async function writeMetrics(
  postId: number,
  m: {
    views: number | null;
    reach: number | null;
    engagement: number | null;
    likes: number | null;
    comments: number | null;
    saves: number | null;
    shares: number | null;
    profileVisits: number | null;
    linkClicks: number | null;
  }
): Promise<void> {
  await sql`
    INSERT INTO post_metrics (
      post_id, recorded_on, recorded_at, views, reach, engagement,
      likes, comments, saves, shares, profile_visits, link_clicks
    )
    VALUES (
      ${postId}, CURRENT_DATE, NOW(), ${m.views}, ${m.reach}, ${m.engagement},
      ${m.likes}, ${m.comments}, ${m.saves}, ${m.shares}, ${m.profileVisits}, ${m.linkClicks}
    )
    ON CONFLICT (post_id, recorded_on) DO UPDATE SET
      recorded_at    = NOW(),
      views          = EXCLUDED.views,
      reach          = EXCLUDED.reach,
      engagement     = EXCLUDED.engagement,
      likes          = EXCLUDED.likes,
      comments       = EXCLUDED.comments,
      saves          = EXCLUDED.saves,
      shares         = EXCLUDED.shares,
      profile_visits = EXCLUDED.profile_visits,
      link_clicks    = EXCLUDED.link_clicks
  `;
}

function num(values: Record<string, number>, key: string): number | null {
  return typeof values[key] === 'number' ? values[key] : null;
}

function sumDefined(...parts: (number | null)[]): number | null {
  const present = parts.filter((p): p is number => typeof p === 'number');
  return present.length > 0 ? present.reduce((a, b) => a + b, 0) : null;
}

function recordUnavailable(
  report: PlatformReport,
  objectId: string,
  insights: InsightResult
): void {
  for (const f of insights.failed) {
    report.metricsUnavailable.push({ object: objectId, metric: f.metric, reason: f.reason });
  }
}

/** Only sets link_slug if that slug actually exists, since posts.link_slug is a foreign key. */
async function resolveKnownSlug(caption: string | null | undefined): Promise<string | null> {
  const slug = slugFromCaption(caption);
  if (!slug) return null;
  const rows = await sql`SELECT slug FROM links WHERE slug = ${slug}`;
  return rows.length > 0 ? (rows[0].slug as string) : null;
}

async function syncFacebook(cfg: MetaConfig, since: Date): Promise<PlatformReport> {
  const report = emptyReport();

  const posts = await fetchFacebookPosts(cfg, since);
  report.fetched = posts.length;

  for (const post of posts) {
    try {
      const linkSlug = await resolveKnownSlug(post.message);

      const postId = await upsertPost({
        platform: 'facebook',
        platformPostId: post.id,
        format: facebookFormat(post),
        mediaProductType: facebookMediaType(post),
        publishedAt: post.created_time,
        caption: post.message ?? null,
        thumbnailUrl: post.full_picture ?? null,
        permalink: post.permalink_url ?? null,
        linkSlug,
      });
      report.postsUpserted += 1;

      const insights = await fetchFacebookPostInsights(cfg, post.id);
      recordUnavailable(report, post.id, insights);

      const likes = post.reactions?.summary?.total_count ?? null;
      const comments = post.comments?.summary?.total_count ?? null;
      const shares = post.shares?.count ?? null;

      await writeMetrics(postId, {
        views: num(insights.values, 'post_media_view'),
        reach: num(insights.values, 'post_total_media_view_unique'),
        engagement: sumDefined(likes, comments, shares),
        likes,
        comments,
        saves: null, // Facebook does not expose saves on Page posts.
        shares,
        profileVisits: null, // Page level only, not per post.
        // post_clicks counts every click on the post, not link clicks alone.
        // First-party truth for link clicks lives in click_events.
        linkClicks: num(insights.values, 'post_clicks'),
      });
      report.metricsWritten += 1;
    } catch (e) {
      report.errors.push({ object: post.id, reason: errText(e) });
    }
  }

  return report;
}

async function syncInstagram(cfg: MetaConfig, since: Date): Promise<PlatformReport> {
  const report = emptyReport();

  const media = await fetchInstagramMedia(cfg, since);
  report.fetched = media.length;

  for (const item of media) {
    try {
      const linkSlug = await resolveKnownSlug(item.caption);

      const postId = await upsertPost({
        platform: 'instagram',
        platformPostId: item.id,
        format: instagramFormat(item),
        mediaProductType: item.media_product_type ?? null,
        publishedAt: item.timestamp,
        caption: item.caption ?? null,
        thumbnailUrl: item.thumbnail_url ?? item.media_url ?? null,
        permalink: item.permalink ?? null,
        linkSlug,
      });
      report.postsUpserted += 1;

      const insights = await fetchInstagramMediaInsights(cfg, item);
      recordUnavailable(report, item.id, insights);

      const likes = item.like_count ?? null;
      const comments = item.comments_count ?? null;
      const saves = num(insights.values, 'saved');
      const shares = num(insights.values, 'shares');

      await writeMetrics(postId, {
        views: num(insights.values, 'views'),
        reach: num(insights.values, 'reach'),
        // total_interactions is Meta's own roll-up. Fall back to a manual sum
        // when the account does not return it.
        engagement:
          num(insights.values, 'total_interactions') ??
          sumDefined(likes, comments, saves, shares),
        likes,
        comments,
        saves,
        shares,
        profileVisits: num(insights.values, 'profile_visits'),
        linkClicks: null, // Instagram reports link clicks on Stories only.
      });
      report.metricsWritten += 1;
    } catch (e) {
      report.errors.push({ object: item.id, reason: errText(e) });
    }
  }

  return report;
}

/**
 * Records today's follower totals and backfills whatever daily-gain history
 * Instagram will still give up.
 *
 * Only `source = 'api'` rows are touched. A manually entered figure, including
 * the personal Facebook profile, is never overwritten here.
 */
async function syncAudience(cfg: MetaConfig) {
  const report = { written: 0, errors: [] as { account: string; reason: string }[] };

  const accounts: { platform: string; label: string; read: () => Promise<{ followers: number | null }> }[] = [
    { platform: 'instagram', label: 'QYLAT Instagram', read: () => fetchInstagramAudience(cfg) },
    { platform: 'facebook', label: 'QYLAT Facebook Page', read: () => fetchPageAudience(cfg) },
  ];

  for (const account of accounts) {
    try {
      const reading = await account.read();
      await sql`
        INSERT INTO audience_snapshots (recorded_on, platform, account_label, followers, source)
        VALUES (CURRENT_DATE, ${account.platform}, ${account.label}, ${reading.followers}, 'api')
        ON CONFLICT (platform, recorded_on) DO UPDATE SET
          followers     = EXCLUDED.followers,
          account_label = EXCLUDED.account_label
        WHERE audience_snapshots.source = 'api'
      `;
      report.written += 1;
    } catch (e) {
      report.errors.push({ account: account.platform, reason: errText(e) });
    }
  }

  // Daily gains, backfilled. The window is short and shrinking, so this is
  // best effort and must never fail the run.
  try {
    const history = await fetchInstagramFollowerHistory(cfg, 30);
    for (const point of history) {
      await sql`
        INSERT INTO audience_snapshots (recorded_on, platform, account_label, new_followers, source)
        VALUES (${point.day}::date, 'instagram', 'QYLAT Instagram', ${point.gain}, 'api')
        ON CONFLICT (platform, recorded_on) DO UPDATE SET
          new_followers = EXCLUDED.new_followers
        WHERE audience_snapshots.source = 'api'
      `;
    }
  } catch (e) {
    report.errors.push({ account: 'instagram-history', reason: errText(e) });
  }

  return report;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized. Set CRON_SECRET and send it as a bearer token.' },
      { status: 401 }
    );
  }

  let cfg: MetaConfig;
  try {
    cfg = metaConfig();
  } catch (e) {
    return NextResponse.json({ ok: false, error: errText(e) }, { status: 500 });
  }

  const daysParam = Number(request.nextUrl.searchParams.get('days'));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : DEFAULT_LOOKBACK_DAYS;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const startedAt = new Date();

  let facebook: PlatformReport | { failed: string };
  try {
    facebook = await syncFacebook(cfg, since);
  } catch (e) {
    facebook = { failed: errText(e) };
  }

  let instagram: PlatformReport | { failed: string };
  try {
    instagram = await syncInstagram(cfg, since);
  } catch (e) {
    instagram = { failed: errText(e) };
  }

  let audience: { written: number; errors: { account: string; reason: string }[] } | { failed: string };
  try {
    audience = await syncAudience(cfg);
  } catch (e) {
    audience = { failed: errText(e) };
  }

  const hardFailure = 'failed' in facebook || 'failed' in instagram;

  return NextResponse.json(
    {
      ok: !hardFailure,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      lookbackDays: days,
      since: since.toISOString(),
      facebook,
      instagram,
      audience,
    },
    { status: hardFailure ? 502 : 200 }
  );
}
