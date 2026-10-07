import { createHash } from 'crypto';

/**
 * Validation and SQL for /api/ingest/personal, kept apart from the route so
 * the same statements can be run against a disposable database in tests.
 *
 * The personal Facebook profile has no API. A local scraper reads three
 * screens and sends one payload per run, a "collection":
 *   timeline  the figures shown on a post on the profile
 *   library   the Content Library table in the professional dashboard
 *   audience  the Audience screen: exact follower total, 28 day follows
 *
 * Rules that the statements below enforce, each of which exists because the
 * opposite would produce a figure that looks real and is not:
 *   - A null is unknown. Nothing here turns a blank or "--" into zero.
 *   - Labels are Facebook's own. Viewers is stored as Viewers, never as reach.
 *   - Every observation belongs to one collection. A new run adds rows. The
 *     same run sent twice adds nothing.
 *   - A post that is absent from a run is left exactly as it was.
 *   - A manual audience row is never overwritten.
 */

export const PLATFORM = 'facebook-personal';
export const ACCOUNT_LABEL = 'Liz personal Facebook';
export const CONTRACT = 2;

const SOURCES = ['timeline', 'library', 'audience'] as const;
type Source = (typeof SOURCES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TRACKING_ID = /^[ps]\d{6,40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UNITS = ['count', 'seconds', 'multiple'];
const MAX_POSTS = 300;
const MAX_OBSERVATIONS = 6000;
const MAX_CAPTION = 20000;

export type CleanPost = {
  tracking_id: string;
  kind: 'post' | 'story';
  format: 'story' | null;
  caption: string | null;
  caption_complete: boolean | null;
  published_at: string | null;
  published_label: string | null;
  permalink: string | null;
  timeline_id: string | null;
  in_library: boolean;
  on_timeline: boolean;
};

export type CleanObservation = {
  tracking_id: string | null;
  source: Source;
  label: string;
  raw: string | null;
  value: number | null;
  unit: string | null;
  exact: boolean | null;
  /**
   * 'lifetime' only for the Content Library's Views, the one figure verified
   * as a running total. Everything else is 'unknown', including every
   * payload from a collector that sends no scope at all.
   */
  scope: 'unknown' | 'lifetime';
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
};

type SourceState = {
  status: 'ok' | 'failed';
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
};

export type CleanPayload = {
  collection_id: string;
  collected_at: string;
  collected_on: string;
  timezone: string;
  timezone_check: 'consistent' | 'unverified';
  sources: Record<Source, SourceState>;
  posts: CleanPost[];
  observations: CleanObservation[];
  followers: number | null;
  unmatched: { source: string; id: string; reason: string }[];
};

export type Statement = { text: string; params: unknown[] };

export function payloadHash(rawBody: string): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isoOrNull(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

function dayOrNull(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' && DAY.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined;
}

function textOrNull(v: unknown, max: number): string | null | undefined {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' && v.length <= max ? v : undefined;
}

/**
 * Checks the whole payload and returns every problem found. One invalid item
 * refuses the lot: a run is written completely or not at all.
 */
export function validatePayload(body: unknown): { payload: CleanPayload } | { errors: string[] } {
  const errors: string[] = [];
  if (!isObject(body)) return { errors: ['Body is not a JSON object.'] };
  if (body.contract !== CONTRACT) return { errors: [`contract must be ${CONTRACT}.`] };

  const collectionId = typeof body.collection_id === 'string' ? body.collection_id.toLowerCase() : '';
  if (!UUID.test(collectionId)) errors.push('collection_id is not a UUID.');

  const collectedAt = isoOrNull(body.collected_at);
  if (!collectedAt) errors.push('collected_at is missing or not a date.');
  else if (Date.parse(collectedAt) > Date.now() + 3600_000) errors.push('collected_at is in the future.');

  const collectedOn = dayOrNull(body.collected_on);
  if (!collectedOn) errors.push('collected_on is missing or not YYYY-MM-DD.');

  const timezone = typeof body.timezone === 'string' && body.timezone.length <= 64 ? body.timezone : '';
  if (!timezone) errors.push('timezone is missing.');

  // An inconsistent check means the displayed times and the relative ones
  // disagreed, so every converted publish time in the run is suspect.
  const tzCheck = body.timezone_check;
  if (tzCheck !== 'consistent' && tzCheck !== 'unverified') {
    errors.push('timezone_check must be consistent or unverified. An inconsistent run is not accepted.');
  }

  const sources = {} as Record<Source, SourceState>;
  const rawSources = isObject(body.sources) ? body.sources : {};
  for (const name of SOURCES) {
    const s = rawSources[name];
    if (!isObject(s) || (s.status !== 'ok' && s.status !== 'failed')) {
      errors.push(`sources.${name}.status must be ok or failed.`);
      sources[name] = { status: 'failed', period_label: null, period_start: null, period_end: null };
      continue;
    }
    const label = textOrNull(s.period_label, 120);
    const start = dayOrNull(s.period_start);
    const end = dayOrNull(s.period_end);
    if (label === undefined || start === undefined || end === undefined) {
      errors.push(`sources.${name} has a malformed period.`);
    }
    if (start && end && start > end) errors.push(`sources.${name} period starts after it ends.`);
    sources[name] = {
      status: s.status,
      period_label: label ?? null,
      period_start: start ?? null,
      period_end: end ?? null,
    };
  }
  if (SOURCES.every((n) => sources[n].status === 'failed')) {
    errors.push('Every source failed. There is nothing to store.');
  }

  const posts: CleanPost[] = [];
  const seenPosts = new Set<string>();
  const rawPosts = Array.isArray(body.posts) ? body.posts : null;
  if (!rawPosts) errors.push('posts must be an array.');
  else if (rawPosts.length > MAX_POSTS) errors.push(`Too many posts: ${rawPosts.length}, limit ${MAX_POSTS}.`);
  else {
    rawPosts.forEach((p, i) => {
      const at = `posts[${i}]`;
      if (!isObject(p)) return errors.push(`${at} is not an object.`);
      const id = p.tracking_id;
      if (typeof id !== 'string' || !TRACKING_ID.test(id)) return errors.push(`${at}.tracking_id is malformed.`);
      if (seenPosts.has(id)) return errors.push(`${at}.tracking_id appears twice.`);
      seenPosts.add(id);

      const kind = id.startsWith('s') ? 'story' : 'post';
      if (p.kind !== kind) errors.push(`${at}.kind does not match its tracking_id.`);
      const format = kind === 'story' ? 'story' : null;
      if ((p.format ?? null) !== format) errors.push(`${at}.format must be story for a story and null otherwise.`);

      const caption = textOrNull(p.caption, MAX_CAPTION);
      if (caption === undefined) errors.push(`${at}.caption is not text or is too long.`);
      if (caption === '') errors.push(`${at}.caption is empty. Send null for no caption.`);
      const complete = p.caption_complete ?? null;
      if (complete !== null && typeof complete !== 'boolean') errors.push(`${at}.caption_complete is not a boolean.`);

      const publishedAt = isoOrNull(p.published_at);
      if (publishedAt === undefined) errors.push(`${at}.published_at is not a date.`);
      else if (publishedAt && Date.parse(publishedAt) > Date.now() + 3600_000) {
        errors.push(`${at}.published_at is in the future.`);
      }
      const publishedLabel = textOrNull(p.published_label, 80);
      if (publishedLabel === undefined) errors.push(`${at}.published_label is malformed.`);

      let permalink = textOrNull(p.permalink, 500);
      if (permalink === undefined) errors.push(`${at}.permalink is malformed.`);
      if (permalink) {
        try {
          const u = new URL(permalink);
          const host = u.hostname;
          if (u.protocol !== 'https:' || (host !== 'facebook.com' && !host.endsWith('.facebook.com'))) {
            errors.push(`${at}.permalink is not an https facebook.com URL.`);
            permalink = null;
          }
        } catch {
          errors.push(`${at}.permalink is not a URL.`);
          permalink = null;
        }
      }

      const timelineId = textOrNull(p.timeline_id, 60);
      if (timelineId === undefined) errors.push(`${at}.timeline_id is malformed.`);

      const inLibrary = p.in_library === true;
      const onTimeline = p.on_timeline === true;
      if (!inLibrary && !onTimeline) errors.push(`${at} was seen in neither source.`);
      if (inLibrary && sources.library.status !== 'ok') errors.push(`${at} claims the library, which failed.`);
      if (onTimeline && sources.timeline.status !== 'ok') errors.push(`${at} claims the timeline, which failed.`);
      // The exact publish time only ever comes from the Content Library.
      if (!inLibrary && (publishedAt || publishedLabel)) {
        errors.push(`${at} has a publish time without a library row.`);
      }

      posts.push({
        tracking_id: id,
        kind,
        format,
        caption: caption ?? null,
        caption_complete: typeof complete === 'boolean' ? complete : null,
        published_at: publishedAt ?? null,
        published_label: publishedLabel ?? null,
        permalink: permalink ?? null,
        timeline_id: timelineId ?? null,
        in_library: inLibrary,
        on_timeline: onTimeline,
      });
    });
  }

  const observations: CleanObservation[] = [];
  const seenObs = new Set<string>();
  const rawObs = Array.isArray(body.observations) ? body.observations : null;
  if (!rawObs) errors.push('observations must be an array.');
  else if (rawObs.length > MAX_OBSERVATIONS) {
    errors.push(`Too many observations: ${rawObs.length}, limit ${MAX_OBSERVATIONS}.`);
  } else {
    rawObs.forEach((o, i) => {
      const at = `observations[${i}]`;
      if (!isObject(o)) return errors.push(`${at} is not an object.`);
      const source = o.source as Source;
      if (!SOURCES.includes(source)) return errors.push(`${at}.source is unknown.`);
      if (sources[source].status !== 'ok') errors.push(`${at} comes from ${source}, which failed.`);

      const id = o.tracking_id ?? null;
      if (source === 'audience') {
        if (id !== null) errors.push(`${at} is an audience figure and must not name a post.`);
      } else if (typeof id !== 'string' || !seenPosts.has(id)) {
        errors.push(`${at}.tracking_id is not one of the posts in this payload.`);
      }

      const label = typeof o.label === 'string' ? o.label.trim() : '';
      if (!label || label.length > 80) errors.push(`${at}.label is missing or too long.`);
      const key = `${id}|${source}|${label}`;
      if (seenObs.has(key)) errors.push(`${at} repeats ${source} ${label} for the same post.`);
      seenObs.add(key);

      const raw = textOrNull(o.raw, 60);
      if (raw === undefined) errors.push(`${at}.raw is malformed.`);
      const value = o.value ?? null;
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
        errors.push(`${at}.value is not a number.`);
      }
      const unit = o.unit ?? null;
      const exact = o.exact ?? null;
      if (value === null) {
        // No number was read. It stays unknown, with whatever text was shown.
        if (unit !== null || exact !== null) errors.push(`${at} has a unit or exact flag without a value.`);
      } else {
        if (typeof unit !== 'string' || !UNITS.includes(unit)) errors.push(`${at}.unit is unknown.`);
        if (typeof exact !== 'boolean') errors.push(`${at}.exact must be a boolean when there is a value.`);
        if (!raw) errors.push(`${at} has a value without the text it was read from.`);
      }

      // A scope is a claim about what a figure means, so it is accepted only
      // where that was verified: the library's Views. Anything else claiming
      // a known scope is refused outright, not quietly stored as unknown.
      const scope = o.scope ?? 'unknown';
      if (scope !== 'unknown' && scope !== 'lifetime') errors.push(`${at}.scope is unknown.`);
      if (scope === 'lifetime' && !(source === 'library' && label === 'Views')) {
        errors.push(`${at} claims a lifetime scope, which is only accepted for the Content Library's Views.`);
      }

      const periodLabel = textOrNull(o.period_label, 120);
      const periodStart = dayOrNull(o.period_start);
      const periodEnd = dayOrNull(o.period_end);
      if (periodLabel === undefined || periodStart === undefined || periodEnd === undefined) {
        errors.push(`${at} has a malformed period.`);
      }

      observations.push({
        tracking_id: typeof id === 'string' ? id : null,
        source,
        label,
        raw: raw ?? null,
        value: typeof value === 'number' ? value : null,
        unit: typeof unit === 'string' ? unit : null,
        exact: typeof exact === 'boolean' ? exact : null,
        scope: scope === 'lifetime' ? 'lifetime' : 'unknown',
        period_label: periodLabel ?? null,
        period_start: periodStart ?? null,
        period_end: periodEnd ?? null,
      });
    });
  }

  // Only an exact total is a follower count. "1.1K" is a display figure and
  // would move in steps of a hundred.
  let followers: number | null = null;
  if (body.followers !== null && body.followers !== undefined) {
    const f = body.followers;
    if (!isObject(f) || !Number.isInteger(f.value) || (f.value as number) < 0 || f.exact !== true) {
      errors.push('followers must be an exact, whole, non negative figure, or null.');
    } else if (sources.audience.status !== 'ok') {
      errors.push('followers was sent although the audience source failed.');
    } else {
      followers = f.value as number;
    }
  }

  const unmatched: CleanPayload['unmatched'] = [];
  for (const u of Array.isArray(body.unmatched) ? body.unmatched.slice(0, 100) : []) {
    if (isObject(u)) {
      unmatched.push({
        source: String(u.source ?? '').slice(0, 20),
        id: String(u.id ?? '').slice(0, 60),
        reason: String(u.reason ?? '').slice(0, 200),
      });
    }
  }

  if (errors.length > 0) return { errors };
  return {
    payload: {
      collection_id: collectionId,
      collected_at: collectedAt as string,
      collected_on: collectedOn as string,
      timezone,
      timezone_check: tzCheck as 'consistent' | 'unverified',
      sources,
      posts,
      observations,
      followers,
      unmatched,
    },
  };
}

/** Looks up an earlier delivery of the same collection. */
export function findCollection(collectionId: string): Statement {
  return {
    text: 'SELECT payload_hash FROM profile_collections WHERE collection_id = $1::uuid',
    params: [collectionId],
  };
}

const POST_COLUMNS = `x(
  tracking_id text, kind text, format text, caption text, caption_complete boolean,
  published_at timestamptz, published_label text, permalink text, timeline_id text,
  in_library boolean, on_timeline boolean
)`;

/**
 * The statements for one collection, to run in order inside one transaction.
 * The last one is the audience upsert when a follower total was sent: it
 * returns a row when it wrote, and none when another source owns that day.
 */
export function buildStatements(p: CleanPayload, hash: string): Statement[] {
  const posts = JSON.stringify(p.posts);
  const observations = JSON.stringify(p.observations);
  const s = p.sources;

  const statements: Statement[] = [
    {
      // No ON CONFLICT: a second delivery of this collection_id fails here and
      // takes the whole transaction with it.
      text: `
        INSERT INTO profile_collections (
          collection_id, payload_hash, collected_at, collected_on, timezone, timezone_check,
          timeline_status, library_status, audience_status,
          library_period_label, library_period_start, library_period_end,
          audience_period_label, audience_period_start, audience_period_end, unmatched
        ) VALUES (
          $1::uuid, $2, $3::timestamptz, $4::date, $5, $6,
          $7, $8, $9,
          $10, $11::date, $12::date,
          $13, $14::date, $15::date, $16::jsonb
        )`,
      params: [
        p.collection_id, hash, p.collected_at, p.collected_on, p.timezone, p.timezone_check,
        s.timeline.status, s.library.status, s.audience.status,
        s.library.period_label, s.library.period_start, s.library.period_end,
        s.audience.period_label, s.audience.period_start, s.audience.period_end,
        JSON.stringify(p.unmatched),
      ],
    },
    {
      // New posts only. The prefix keeps a scraped ID off any row the Meta
      // sync owns, since platform_post_id is unique across every platform.
      text: `
        INSERT INTO posts (platform, platform_post_id, format, caption, published_at, permalink, last_synced_at)
        SELECT '${PLATFORM}', 'personal:' || x.tracking_id, x.format, x.caption, x.published_at, x.permalink, NOW()
        FROM jsonb_to_recordset($1::jsonb) AS ${POST_COLUMNS}
        ON CONFLICT (platform_post_id) DO NOTHING`,
      params: [posts],
    },
    {
      // Posts already known. A complete caption is never replaced by a
      // truncated one, and an exact publish time is never replaced by nothing.
      // This runs before profile_posts is touched, so caption_complete below
      // is still what the previous collection left.
      text: `
        UPDATE posts p SET
          caption = CASE
            WHEN x.caption_complete IS TRUE THEN x.caption
            WHEN (SELECT pp.caption_complete FROM profile_posts pp WHERE pp.post_id = p.id) IS TRUE THEN p.caption
            WHEN x.caption IS NULL THEN p.caption
            WHEN p.caption IS NULL OR length(x.caption) > length(p.caption) THEN x.caption
            ELSE p.caption
          END,
          published_at   = COALESCE(x.published_at, p.published_at),
          permalink      = COALESCE(x.permalink, p.permalink),
          format         = COALESCE(x.format, p.format),
          last_synced_at = NOW()
        FROM jsonb_to_recordset($1::jsonb) AS ${POST_COLUMNS}
        WHERE p.platform_post_id = 'personal:' || x.tracking_id
          AND p.platform = '${PLATFORM}'`,
      params: [posts],
    },
    {
      text: `
        INSERT INTO profile_posts (
          post_id, kind, published_label, published_timezone, caption_complete, timeline_id,
          first_collection, last_library_collection, last_timeline_collection
        )
        SELECT p.id, x.kind, x.published_label,
               CASE WHEN x.published_label IS NOT NULL THEN $3::text END,
               x.caption_complete, x.timeline_id,
               c.id,
               CASE WHEN x.in_library THEN c.id END,
               CASE WHEN x.on_timeline THEN c.id END
        FROM jsonb_to_recordset($1::jsonb) AS ${POST_COLUMNS}
        JOIN posts p ON p.platform_post_id = 'personal:' || x.tracking_id AND p.platform = '${PLATFORM}'
        JOIN profile_collections c ON c.collection_id = $2::uuid
        ON CONFLICT (post_id) DO UPDATE SET
          published_label    = COALESCE(EXCLUDED.published_label, profile_posts.published_label),
          published_timezone = COALESCE(EXCLUDED.published_timezone, profile_posts.published_timezone),
          caption_complete   = CASE
            WHEN EXCLUDED.caption_complete IS TRUE OR profile_posts.caption_complete IS TRUE THEN TRUE
            ELSE COALESCE(EXCLUDED.caption_complete, profile_posts.caption_complete)
          END,
          timeline_id              = COALESCE(EXCLUDED.timeline_id, profile_posts.timeline_id),
          last_library_collection  = COALESCE(EXCLUDED.last_library_collection, profile_posts.last_library_collection),
          last_timeline_collection = COALESCE(EXCLUDED.last_timeline_collection, profile_posts.last_timeline_collection)`,
      params: [posts, p.collection_id, p.timezone],
    },
    {
      // One row per figure shown, null value included. The raw text, the
      // source, the label and the collection time are stored as sent. scope
      // is 'unknown' unless the payload says otherwise, which validation
      // allows only for the library's Views. Rows from earlier collections
      // are never rewritten: their scope stays as it was stored.
      text: `
        INSERT INTO profile_metrics (
          collection, post_id, source, label, raw, value, unit, exact, scope,
          period_label, period_start, period_end, collected_at
        )
        SELECT c.id, p.id, x.source, x.label, x.raw, x.value, x.unit, x.exact, COALESCE(x.scope, 'unknown'),
               x.period_label, x.period_start, x.period_end, c.collected_at
        FROM jsonb_to_recordset($1::jsonb) AS x(
          tracking_id text, source text, label text, raw text, value numeric, unit text, exact boolean, scope text,
          period_label text, period_start date, period_end date
        )
        JOIN profile_collections c ON c.collection_id = $2::uuid
        LEFT JOIN posts p ON p.platform_post_id = 'personal:' || x.tracking_id AND p.platform = '${PLATFORM}'
        WHERE x.tracking_id IS NULL OR p.id IS NOT NULL`,
      params: [observations, p.collection_id],
    },
  ];

  if (p.followers !== null) {
    statements.push({
      // One statement, so the check and the write cannot be separated. A day
      // already held by a manual or api row is left alone and returns no row.
      // new_followers is never written: the daily change is derived from
      // consecutive exact totals by the profile_follower_changes view.
      text: `
        INSERT INTO audience_snapshots (recorded_on, platform, account_label, followers, source)
        VALUES ($1::date, '${PLATFORM}', '${ACCOUNT_LABEL}', $2, 'scrape')
        ON CONFLICT (platform, recorded_on) DO UPDATE SET
          followers = EXCLUDED.followers
        WHERE audience_snapshots.source = 'scrape'
        RETURNING source`,
      params: [p.collected_on, p.followers],
    });
  }

  return statements;
}
