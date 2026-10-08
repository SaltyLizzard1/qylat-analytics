import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
  metaConfig,
  errText,
  fetchFacebookPosts,
  fetchFacebookPostInsights,
  fetchInstagramMedia,
  fetchInstagramStories,
  fetchInstagramMediaInsights,
  instagramFormat,
  facebookFormat,
  facebookMediaType,
  facebookPageUpdate,
  fetchInstagramAudience,
  fetchPageAudience,
  fetchInstagramFollowerHistory,
  fetchPageFollowerHistory,
  slugFromCaption,
  type MetaConfig,
  type InsightResult,
  type InstagramMedia,
  type FacebookPost,
} from '@/lib/meta';
import { autoLinkAfterIngestion } from '@/lib/autolink';
import { buildQueue, queueKey, runQueue, type DuePost } from '@/lib/refresh-queue';
import { hasGroupTables } from '@/lib/combined';
import { THRESHOLDS } from '@/lib/status';

export const dynamic = 'force-dynamic';
// Vercel Hobby caps a function at 60s unless Fluid Compute is on. The daily
// cron runs a 7 day window to stay well inside that. Backfills go through a
// manual call with ?days=90, which needs Fluid Compute or a paid plan.
export const maxDuration = 60;

const DEFAULT_LOOKBACK_DAYS = 30;

type PlatformReport = {
  fetched: number;
  /** Instagram only: live stories read from their own edge. */
  stories: number;
  postsUpserted: number;
  metricsWritten: number;
  errors: { object: string; reason: string }[];
  metricsUnavailable: { object: string; metric: string; reason: string }[];
  /** Objects Meta withheld every insight on for having too few viewers. A state, not a fault. */
  insightsWithheld: string[];
};

function emptyReport(): PlatformReport {
  return {
    fetched: 0,
    stories: 0,
    postsUpserted: 0,
    metricsWritten: 0,
    errors: [],
    metricsUnavailable: [],
    insightsWithheld: [],
  };
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
  /** Facebook's reason when the row is a cover or profile photo change, else null. */
  pageUpdate: string | null;
}): Promise<number> {
  const rows = await sql`
    INSERT INTO posts (
      platform, platform_post_id, format, media_product_type,
      published_at, caption, thumbnail_url, permalink, link_slug, page_update, last_synced_at
    )
    VALUES (
      ${input.platform}, ${input.platformPostId}, ${input.format}, ${input.mediaProductType},
      ${input.publishedAt}, ${input.caption}, ${input.thumbnailUrl}, ${input.permalink},
      ${input.linkSlug}, ${input.pageUpdate}, NOW()
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
      -- Refreshed every run, so a backfilled "not fetched yet" gets its reason.
      page_update        = EXCLUDED.page_update,
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
    if (/not enough viewers/i.test(f.reason)) {
      if (!report.insightsWithheld.includes(objectId)) report.insightsWithheld.push(objectId);
      continue;
    }
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

/** One Page post into posts and post_metrics. */
async function syncFacebookPost(cfg: MetaConfig, post: FacebookPost, report: PlatformReport): Promise<void> {
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
      pageUpdate: facebookPageUpdate(post),
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

async function syncFacebook(cfg: MetaConfig, since: Date): Promise<PlatformReport> {
  const report = emptyReport();

  const posts = await fetchFacebookPosts(cfg, since);
  report.fetched = posts.length;

  for (const post of posts) await syncFacebookPost(cfg, post, report);

  return report;
}

/** One Instagram media object, feed post or story, into posts and post_metrics. */
async function syncInstagramItem(cfg: MetaConfig, item: InstagramMedia, report: PlatformReport): Promise<void> {
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
      pageUpdate: null, // Instagram media has no equivalent.
    });
    report.postsUpserted += 1;

    const insights = await fetchInstagramMediaInsights(cfg, item);
    recordUnavailable(report, item.id, insights);

    const likes = item.like_count ?? null;
    const comments = item.comments_count ?? null;
    const saves = num(insights.values, 'saved');
    const shares = num(insights.values, 'shares');
    // A story has replies where a post has comments.
    const replies = num(insights.values, 'replies');

    await writeMetrics(postId, {
      views: num(insights.values, 'views'),
      reach: num(insights.values, 'reach'),
      // total_interactions is Meta's own roll-up. Fall back to a manual sum
      // when the account does not return it.
      engagement:
        num(insights.values, 'total_interactions') ??
        sumDefined(likes, comments ?? replies, saves, shares),
      likes,
      comments: comments ?? replies,
      saves,
      shares,
      profileVisits: num(insights.values, 'profile_visits'),
      linkClicks: null, // Instagram exposes no link tap count on stories or posts.
    });
    report.metricsWritten += 1;
  } catch (e) {
    report.errors.push({ object: item.id, reason: errText(e) });
  }
}

async function syncInstagram(cfg: MetaConfig, since: Date): Promise<PlatformReport> {
  const report = emptyReport();

  const media = await fetchInstagramMedia(cfg, since);
  report.fetched = media.length;
  for (const item of media) await syncInstagramItem(cfg, item, report);

  // Stories are on their own edge and never in /media. Only live ones come
  // back, so a story is written once, at whatever age this run catches it. A
  // failure here is reported and must not cost the media already written.
  let stories: InstagramMedia[] = [];
  try {
    stories = await fetchInstagramStories(cfg);
  } catch (e) {
    report.errors.push({ object: 'stories', reason: errText(e) });
  }
  report.stories = stories.length;
  for (const item of stories) await syncInstagramItem(cfg, item, report);

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

  // Daily gains, backfilled for both accounts. The window is short and
  // shrinking, so this is best effort and must never fail the run.
  const histories: { platform: string; label: string; load: () => Promise<{ day: string; gain: number }[]> }[] = [
    { platform: 'instagram', label: 'QYLAT Instagram', load: () => fetchInstagramFollowerHistory(cfg, 30) },
    { platform: 'facebook', label: 'QYLAT Facebook Page', load: () => fetchPageFollowerHistory(cfg, 30) },
  ];

  for (const h of histories) {
    try {
      const history = await h.load();
      for (const point of history) {
        await sql`
          INSERT INTO audience_snapshots (recorded_on, platform, account_label, new_followers, source)
          VALUES (${point.day}::date, ${h.platform}, ${h.label}, ${point.gain}, 'api')
          ON CONFLICT (platform, recorded_on) DO UPDATE SET
            new_followers = EXCLUDED.new_followers
          WHERE audience_snapshots.source = 'api'
        `;
      }
    } catch (e) {
      report.errors.push({ account: `${h.platform}-history`, reason: errText(e) });
    }
  }

  return report;
}

type StalePost = { platform: string; post: string; lastRead: string | null };
type LinkedRefresh =
  | { skipped: string; stale?: StalePost[] }
  | { refreshed: number; stoppedForTime: boolean; stale: StalePost[]; errors: { object: string; reason: string }[] };

/**
 * How long after the request started optional work may still begin. The
 * function is killed at maxDuration and returns nothing if it gets there, so
 * the refresh stops well short and what it could not reach is reported.
 */
const OPTIONAL_WORK_UNTIL_MS = 40_000;
/** Matching is a handful of queries. It may start a little later than a refresh. */
const MATCHING_UNTIL_MS = 50_000;

/**
 * Re-reads linked posts the normal window no longer reaches.
 *
 * The daily cron reads 7 days, to stay inside the 60 seconds this plan
 * allows. So a post's figures stop moving after its first week, and a
 * combined total for older content rests on week-old Instagram and Page
 * readings beside a fresh Profile one. This reads linked Instagram and Page
 * posts published within THRESHOLDS.linkedRefreshDays that fall outside the
 * window, least recently read first.
 *
 * The posts are read as one queue across both accounts, strictly least
 * recently read first (lib/refresh-queue.ts). Meta's own order, newest
 * first, plays no part. The first version followed it, one account after
 * the other, and on 8 Oct 2026 re-read the same four newest Page posts on
 * two runs while six older ones, read last in September, were never
 * reached before the clock ran out.
 *
 * Two limits, and neither is a promise that the work fits. At most
 * THRESHOLDS.linkedRefreshMax posts per account are attempted. And every
 * post is started only if the deadline has not passed: each list call and
 * each post's insights are checked against the clock one at a time, so a
 * slow day stops the refresh instead of the request. Whatever was not
 * reached keeps its old read time, is returned as `stale`, and is at the
 * front of the queue next run.
 *
 * Each post's metrics are written as that post is read, by the same code
 * the normal sync uses, so nothing read is lost if a later post fails or
 * the clock runs out. Nothing here can remove or roll back a row the sync
 * above already wrote. It cannot refresh the Profile: that is read only by
 * the collector, on demand, for the last 28 days.
 */
async function refreshLinked(cfg: MetaConfig, since: Date, deadline: number, fb: PlatformReport, ig: PlatformReport): Promise<LinkedRefresh> {
  if (!(await hasGroupTables())) return { skipped: 'no linked content yet' };
  const due = await sql(
    `SELECT p.platform, p.platform_post_id, p.published_at,
            (SELECT MAX(m.recorded_at) FROM post_metrics m WHERE m.post_id = p.id) AS read_at
     FROM content_group_members g JOIN posts p ON p.id = g.post_id
     WHERE p.platform IN ('instagram', 'facebook')
       AND p.published_at < $1::timestamptz
       AND p.published_at >= NOW() - make_interval(days => $2)
     ORDER BY read_at ASC NULLS FIRST`,
    [since.toISOString(), THRESHOLDS.linkedRefreshDays]
  );
  const asStale = (d: Record<string, unknown>): StalePost => ({
    platform: d.platform as string,
    post: d.platform_post_id as string,
    lastRead: d.read_at ? new Date(d.read_at as string).toISOString() : null,
  });
  if (Date.now() >= deadline) return { skipped: 'the sync used the time available', stale: due.map(asStale) };

  // One queue across both accounts, least recently read first. The cap is
  // applied in that order, so it only ever drops an account's freshest posts.
  const toDue = (d: Record<string, unknown>): DuePost => ({
    platform: d.platform as string,
    id: d.platform_post_id as string,
    readAt: d.read_at ? new Date(d.read_at as string).toISOString() : null,
  });
  const published = new Map(due.map((d) => [queueKey(toDue(d)), new Date(d.published_at as string).getTime()]));
  const { queue, overCap } = buildQueue(due.map(toDue), THRESHOLDS.linkedRefreshMax);
  const staleOf = (x: DuePost): StalePost => ({ platform: x.platform, post: x.id, lastRead: x.readAt });

  // What Meta returns for each account, keyed by id. Its order is not used:
  // only the queue decides what is read next. A list call that fails, or
  // that the clock leaves no time for, costs that account's posts this run
  // and nothing else.
  const errors: { object: string; reason: string }[] = [];
  const found = new Map<string, InstagramMedia | FacebookPost>();
  for (const platform of ['instagram', 'facebook'] as const) {
    const mine = queue.filter((x) => x.platform === platform);
    if (mine.length === 0 || Date.now() >= deadline) continue;
    const from = new Date(Math.min(...mine.map((x) => published.get(queueKey(x)) as number)) - 60_000);
    try {
      const list: (InstagramMedia | FacebookPost)[] =
        platform === 'instagram' ? await fetchInstagramMedia(cfg, from) : await fetchFacebookPosts(cfg, from);
      for (const item of list) found.set(queueKey({ platform, id: item.id }), item);
    } catch (e) {
      errors.push({ object: `linked ${platform} list`, reason: errText(e) });
    }
  }

  // Each post is written as it is read, by the code the normal sync uses.
  // That code records its own failure and does not throw, so a post that
  // stored nothing is turned into an error here for the queue to report.
  const result = await runQueue(queue, found, deadline, async (post, object) => {
    const report = post.platform === 'instagram' ? ig : fb;
    const before = report.metricsWritten;
    if (post.platform === 'instagram') await syncInstagramItem(cfg, object as InstagramMedia, report);
    else await syncFacebookPost(cfg, object as FacebookPost, report);
    if (report.metricsWritten === before) {
      throw new Error(report.errors[report.errors.length - 1]?.reason ?? 'No reading was stored');
    }
  });
  for (const f of result.failed) errors.push({ object: `${f.post.platform} ${f.post.id}`, reason: f.reason });
  const stale = [...result.failed.map((f) => f.post), ...result.notReached, ...overCap].map(staleOf);
  return { refreshed: result.refreshed.length, stoppedForTime: result.stoppedForTime, stale, errors };
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

  // Optional work, after the sync and only if it worked. The metrics above
  // are already written row by row, and nothing below can remove them: each
  // step is caught, bounded by the clock, and reported in the response.
  const started = startedAt.getTime();
  let linkedRefresh: LinkedRefresh = { skipped: 'the sync failed' };
  let matching: Awaited<ReturnType<typeof autoLinkAfterIngestion>> = { status: 'skipped: the sync failed' };
  if (!('failed' in facebook) && !('failed' in instagram)) {
    try {
      linkedRefresh = await refreshLinked(cfg, since, started + OPTIONAL_WORK_UNTIL_MS, facebook, instagram);
    } catch (e) {
      linkedRefresh = { skipped: `failed: ${errText(e)}` };
    }
    matching =
      Date.now() < started + MATCHING_UNTIL_MS
        ? await autoLinkAfterIngestion()
        : { status: 'skipped: the sync used the time available. Matching runs after the next ingestion' };
  }

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
      linkedRefresh,
      matching,
    },
    { status: hardFailure ? 502 : 200 }
  );
}
