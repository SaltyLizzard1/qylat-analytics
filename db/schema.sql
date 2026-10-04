-- QYLAT Analytics schema
-- Run this once in your Neon SQL editor after creating the database.
-- For an existing database, run the files in db/migrations instead.

-- Short links table
-- One row per /go/ link you create before a post.
CREATE TABLE IF NOT EXISTS links (
  id              SERIAL       PRIMARY KEY,
  slug            VARCHAR(50)  UNIQUE NOT NULL,
  destination_url TEXT         NOT NULL,
  utm_url         TEXT,        -- destination_url with UTM params appended (stored for reference)
  platform        VARCHAR(50)  NOT NULL CHECK (platform IN ('instagram','facebook','tiktok','youtube')),
  post_id         VARCHAR(255),                 -- native platform post ID, filled in after posting
  format          VARCHAR(50)  CHECK (format IN ('reel','carousel','story','short','bio','other')),
  content_theme   VARCHAR(255),                 -- e.g. "thailand-60-days", "cost-of-living-chiang-mai"
  cta_type        VARCHAR(50)  CHECK (cta_type IN ('leap-log','quiz','leap-kit','other')),
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- Click events table
-- One row per redirect hit on a /go/ link. Rows are never deleted or edited.
--
-- classification, rules_version and is_bot are all DERIVED from the raw
-- request and are set by the click_events_classify trigger below, not by the
-- application. Storing the raw user agent and deriving the verdict is what
-- makes a rule change apply to history instead of splitting the totals into a
-- before and an after. is_test is the one flag a human sets, from the Click Log.
--
-- is_bot is a legacy column kept only so code predating migration 008 keeps
-- working. Nothing reads it. Migration 009 drops it.
CREATE TABLE IF NOT EXISTS click_events (
  id             BIGSERIAL    PRIMARY KEY,
  slug           VARCHAR(50)  NOT NULL REFERENCES links(slug),
  clicked_at     TIMESTAMPTZ  DEFAULT NOW(),
  referrer       TEXT,
  user_agent     TEXT,
  country        VARCHAR(10),
  session_id     VARCHAR(255), -- first-party cookie value, identifies one browser over time
  classification VARCHAR(16)  NOT NULL DEFAULT 'uncertain', -- human | uncertain | crawler
  rules_version  INTEGER      NOT NULL DEFAULT 0,           -- which rules produced it
  is_test        BOOLEAN      NOT NULL DEFAULT FALSE,       -- Liz's own test click
  is_bot         BOOLEAN      NOT NULL DEFAULT FALSE        -- legacy, dropped by migration 009
);

CREATE INDEX IF NOT EXISTS click_events_slug_idx       ON click_events (slug);
CREATE INDEX IF NOT EXISTS click_events_clicked_at_idx ON click_events (clicked_at DESC);
CREATE INDEX IF NOT EXISTS click_events_session_idx    ON click_events (session_id);
CREATE INDEX IF NOT EXISTS click_events_human_idx
  ON click_events (slug, clicked_at DESC) WHERE classification = 'human' AND NOT is_test;

-- When the classification rules last changed. The Links page and the Click Log
-- both show this date beside the figures, so totals can never move without a
-- visible reason the way they did when migration 005 backfilled in place.
CREATE TABLE IF NOT EXISTS classification_rules (
  version    INTEGER     PRIMARY KEY,
  changed_on DATE        NOT NULL,
  note       TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hits that could not be recorded. A click that fails to insert still
-- redirects, but it is never swallowed: it lands here and the Click Log shows
-- it. reason is insert_failed, unknown_slug, malformed_path or lookup_failed.
-- slug has no foreign key here on purpose, because an unknown slug is the point.
CREATE TABLE IF NOT EXISTS click_failures (
  id        BIGSERIAL    PRIMARY KEY,
  failed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  slug      VARCHAR(255),
  path      TEXT,
  reason    VARCHAR(40)  NOT NULL,
  detail    TEXT
);

CREATE INDEX IF NOT EXISTS click_failures_failed_at_idx ON click_failures (failed_at DESC);

-- The classifier, and the only place a click is judged. Defined in full in
-- db/migrations/008_click_classification.sql, which is the authoritative copy.
-- Order is load bearing: crawler evidence before human evidence, and positive
-- human evidence before the ambiguous referrer case.

-- Counted clicks. Every figure on every page reads this rather than
-- click_events, so there is one definition of a counted click and no two pages
-- can disagree. deleteLink is the one exception: the foreign key to links.slug
-- covers crawler, uncertain and test rows too.
CREATE OR REPLACE VIEW human_clicks AS
  SELECT id, slug, clicked_at, referrer, user_agent, country, session_id
  FROM click_events
  WHERE classification = 'human' AND NOT is_test;

-- The four states per slug. Mutually exclusive, and they sum to total, so the
-- arithmetic on the Links page is checkable by eye.
CREATE OR REPLACE VIEW click_counts AS
  SELECT
    slug,
    COUNT(*) FILTER (WHERE NOT is_test AND classification = 'human')::int     AS human,
    COUNT(*) FILTER (WHERE NOT is_test AND classification = 'uncertain')::int AS uncertain,
    COUNT(*) FILTER (WHERE NOT is_test AND classification = 'crawler')::int   AS crawler,
    COUNT(*) FILTER (WHERE is_test)::int                                      AS test,
    COUNT(*)::int                                                             AS total
  FROM click_events
  GROUP BY slug;

-- Posts table
-- One row per social post. Facebook and Instagram rows are written by
-- /api/sync/meta from the Meta Graph API. TikTok and YouTube are manual.
-- 'facebook-personal' rows are written by /api/ingest/personal from the local
-- scraper. Their figures live in profile_metrics (migration 010), never in post_metrics.
CREATE TABLE IF NOT EXISTS posts (
  id                 SERIAL       PRIMARY KEY,
  platform           VARCHAR(50)  NOT NULL CONSTRAINT posts_platform_check CHECK (platform IN ('instagram','facebook','facebook-personal','tiktok','youtube')),
  platform_post_id   VARCHAR(255) UNIQUE,         -- native ID from the platform
  format             VARCHAR(50)  CHECK (format IN ('reel','carousel','story','short','bio','other')),
  media_product_type VARCHAR(50),                 -- raw Meta value, e.g. FEED, REELS, STORY
  content_theme      VARCHAR(255),
  published_at       TIMESTAMPTZ,
  caption            TEXT,
  thumbnail_url      TEXT,
  permalink          TEXT,                        -- public URL of the post
  link_slug          VARCHAR(50)  REFERENCES links(slug),  -- the /go/ link used for this post
  last_synced_at     TIMESTAMPTZ,
  created_at         TIMESTAMPTZ  DEFAULT NOW(),
  page_update        TEXT                          -- set when Facebook returned a cover or profile photo change as a post; the reason it gave
);

CREATE INDEX IF NOT EXISTS posts_platform_idx     ON posts (platform);
CREATE INDEX IF NOT EXISTS posts_published_at_idx ON posts (published_at DESC);

-- Posts that count. Facebook returns cover photo and profile picture changes
-- through the same edge as posts, so every figure reads this view. The rows
-- stay in posts, flagged, and the overview lists them. Personal profile posts
-- are excluded too: their figures are Facebook's dashboard labels, not comparable with anything
-- the Meta sync writes.
CREATE OR REPLACE VIEW content_posts AS
  SELECT id, platform, platform_post_id, format, media_product_type, content_theme,
         published_at, caption, thumbnail_url, permalink, link_slug,
         last_synced_at, created_at
  FROM posts
  WHERE page_update IS NULL
    AND platform <> 'facebook-personal';

-- Account level insights, one row per day per metric per breakdown value.
-- Written by /api/sync/account. `metric` is Meta's own name, so a new metric
-- needs no schema change. `dimension` is 'total', or a breakdown value such as
-- FOLLOWER, NON_FOLLOWER or REEL. Reach is unique accounts within the day and
-- must never be summed across days. Views are additive.
CREATE TABLE IF NOT EXISTS account_daily (
  id         SERIAL       PRIMARY KEY,
  platform   VARCHAR(50)  NOT NULL CHECK (platform IN ('instagram','facebook')),
  day        DATE         NOT NULL,
  metric     VARCHAR(80)  NOT NULL,
  dimension  VARCHAR(80)  NOT NULL DEFAULT 'total',
  value      INTEGER,
  synced_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS account_daily_key
  ON account_daily (platform, day, metric, dimension);
CREATE INDEX IF NOT EXISTS account_daily_day_idx ON account_daily (day DESC);

-- Post metrics table
-- One snapshot per post per calendar day, written by /api/sync/meta.
--
-- Note on impressions: Meta retired it on both platforms. Instagram media
-- created after 2024-07-02 report `views`, and Facebook post_impressions
-- became post_media_view. The impressions column is kept for historical rows
-- and is no longer written.
CREATE TABLE IF NOT EXISTS post_metrics (
  id              SERIAL       PRIMARY KEY,
  post_id         INTEGER      NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  recorded_on     DATE         NOT NULL DEFAULT CURRENT_DATE,
  recorded_at     TIMESTAMPTZ  DEFAULT NOW(),
  views           INTEGER,      -- Meta's replacement for impressions
  reach           INTEGER,
  impressions     INTEGER,      -- deprecated by Meta, historical rows only
  engagement      INTEGER,      -- total interactions (likes + comments + saves + shares)
  likes           INTEGER,
  comments        INTEGER,
  saves           INTEGER,
  shares          INTEGER,
  profile_visits  INTEGER,
  link_clicks     INTEGER       -- platform-reported clicks (vs first-party click_events)
);

CREATE INDEX IF NOT EXISTS post_metrics_post_id_idx ON post_metrics (post_id);

CREATE UNIQUE INDEX IF NOT EXISTS post_metrics_post_day_idx
  ON post_metrics (post_id, recorded_on);

-- Audience snapshots table
-- One row per account per day. Rows with source = 'manual' are the only record
-- of anything typed in by hand and are never overwritten by a sync or by the
-- scraper: every automated upsert carries a WHERE on its own source. 'scrape'
-- rows are exact totals read from the personal profile's Audience screen.
-- Defined by migration 002. The source check is as migration 010 leaves it.
CREATE TABLE IF NOT EXISTS audience_snapshots (
  id            SERIAL       PRIMARY KEY,
  recorded_on   DATE         NOT NULL DEFAULT CURRENT_DATE,
  platform      VARCHAR(50)  NOT NULL CHECK (platform IN (
                  'instagram','facebook','facebook-personal','tiktok','youtube'
                )),
  account_label VARCHAR(100),
  followers     INTEGER,      -- total at the time of the snapshot
  new_followers INTEGER,      -- gain on that day, where the platform reports it
  source        VARCHAR(20)  NOT NULL DEFAULT 'api' CONSTRAINT audience_snapshots_source_check CHECK (source IN ('api','manual','scrape')),
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- One snapshot per account per day, so a repeated sync updates in place.
CREATE UNIQUE INDEX IF NOT EXISTS audience_snapshots_platform_day_idx
  ON audience_snapshots (platform, recorded_on);

CREATE INDEX IF NOT EXISTS audience_snapshots_recorded_on_idx
  ON audience_snapshots (recorded_on DESC);

-- The personal Facebook profile (migration 010)
--
-- No API can read this profile. A local scraper reads three screens and sends
-- one payload per run, a "collection": the profile timeline, the dashboard's
-- Content Library, and its Audience screen. None of these rows enter
-- content_posts or post_metrics.
--
-- A null value is unknown, never zero. Labels are Facebook's own: Viewers is
-- stored as Viewers, never as reach. scope stays 'unknown' until it is
-- verified whether a Content Library figure is a lifetime total or a total
-- within the displayed period. Observations are append only.

-- 3. Collections ------------------------------------------------------------

-- One row per scraper run. collection_id is generated by the scraper once per
-- run and travels with the payload, so the same payload sent again is a retry
-- and a later run is a new collection. payload_hash tells a true retry from a
-- different payload reusing an ID, which is refused.
CREATE TABLE IF NOT EXISTS profile_collections (
  id                    SERIAL       PRIMARY KEY,
  collection_id         UUID         NOT NULL UNIQUE,
  payload_hash          CHAR(64)     NOT NULL,
  collected_at          TIMESTAMPTZ  NOT NULL,
  collected_on          DATE         NOT NULL,   -- calendar day in `timezone`
  timezone              TEXT         NOT NULL,   -- zone the browser displayed times in
  timezone_check        TEXT         NOT NULL CHECK (timezone_check IN ('consistent','unverified')),
  timeline_status       TEXT         NOT NULL CHECK (timeline_status IN ('ok','failed')),
  library_status        TEXT         NOT NULL CHECK (library_status  IN ('ok','failed')),
  audience_status       TEXT         NOT NULL CHECK (audience_status IN ('ok','failed')),
  library_period_label  TEXT,                    -- as displayed, e.g. "Last 28 days: Sep 6 - Oct 4"
  library_period_start  DATE,
  library_period_end    DATE,
  audience_period_label TEXT,
  audience_period_start DATE,
  audience_period_end   DATE,
  unmatched             JSONB        NOT NULL DEFAULT '[]',  -- rows the scraper would not join
  received_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profile_collections_collected_at_idx
  ON profile_collections (collected_at DESC);

-- 4. Per post facts that posts has no column for ------------------------------

-- The identity of a post is posts.platform_post_id = 'personal:p<post id>' or
-- 'personal:s<story id>', both decoded from the dashboard's content_id. A
-- video ID is never an identity. It is kept in timeline_id for reference.
CREATE TABLE IF NOT EXISTS profile_posts (
  post_id                  INTEGER  PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  kind                     TEXT     NOT NULL CHECK (kind IN ('post','story')),
  published_label          TEXT,     -- the time exactly as the Content Library showed it
  published_timezone       TEXT,     -- the zone that label was displayed in
  caption_complete         BOOLEAN,  -- true once the full caption was read. null is unknown
  timeline_id              TEXT,
  first_collection         INTEGER  NOT NULL REFERENCES profile_collections(id),
  last_library_collection  INTEGER  REFERENCES profile_collections(id),
  last_timeline_collection INTEGER  REFERENCES profile_collections(id)
);

-- 5. Observations -----------------------------------------------------------

-- One row per figure shown, per collection. post_id is null for an account
-- level figure from the Audience screen.
--
-- label is Facebook's own wording for library and audience figures. The
-- timeline shows icons, not words, so its four labels are the scraper's:
-- "Reactions" (the total beside the like button), "Reactions: <Type>",
-- "Comments" and "Shares".
--
-- raw is the text as displayed. value is null when no number was shown: raw
-- '--' is Facebook's own "no figure", and raw null is a blank. Neither is zero.
CREATE TABLE IF NOT EXISTS profile_metrics (
  id            BIGSERIAL    PRIMARY KEY,
  collection    INTEGER      NOT NULL REFERENCES profile_collections(id),
  post_id       INTEGER      REFERENCES posts(id) ON DELETE CASCADE,
  source        TEXT         NOT NULL CHECK (source IN ('timeline','library','audience')),
  label         TEXT         NOT NULL,
  raw           TEXT,
  value         NUMERIC,
  unit          TEXT         CHECK (unit IN ('count','seconds','multiple')),
  exact         BOOLEAN,     -- false for a rounded display figure such as 1.1K
  scope         TEXT         NOT NULL DEFAULT 'unknown' CHECK (scope IN ('unknown','lifetime','period')),
  period_label  TEXT,        -- the reporting period as displayed beside the figure
  period_start  DATE,
  period_end    DATE,
  collected_at  TIMESTAMPTZ  NOT NULL,
  CHECK (value IS NOT NULL OR (unit IS NULL AND exact IS NULL)),
  CHECK ((source = 'audience') = (post_id IS NULL))
);

-- The conflict key. Within one collection a post has one figure per source
-- and label, so a payload cannot store an observation twice.
CREATE UNIQUE INDEX IF NOT EXISTS profile_metrics_key
  ON profile_metrics (collection, COALESCE(post_id, 0), source, label);

CREATE INDEX IF NOT EXISTS profile_metrics_post_idx
  ON profile_metrics (post_id, source, label, collected_at DESC);

-- 6. Views ------------------------------------------------------------------

-- The most recent observation of each figure for each post. A post that has
-- left the library still appears here with its last reading and the time it
-- was taken, which is what a "last updated" label on the dashboard reads.
CREATE OR REPLACE VIEW profile_metrics_latest AS
  SELECT DISTINCT ON (COALESCE(post_id, 0), source, label)
         post_id, source, label, raw, value, unit, exact, scope,
         period_label, period_start, period_end, collected_at, collection
  FROM profile_metrics
  ORDER BY COALESCE(post_id, 0), source, label, collected_at DESC;

-- Follower change between consecutive scraped totals. Only source = 'scrape'
-- rows are exact totals read from the Audience screen. is_daily is true only
-- when the two rows are on consecutive calendar days. Across a gap, change is
-- the change over `days` days and must not be shown as a daily gain.
CREATE OR REPLACE VIEW profile_follower_changes AS
  SELECT recorded_on,
         followers,
         LAG(recorded_on) OVER w                       AS previous_on,
         LAG(followers)   OVER w                       AS previous_followers,
         followers - LAG(followers) OVER w             AS change,
         recorded_on - LAG(recorded_on) OVER w         AS days,
         (recorded_on - LAG(recorded_on) OVER w) = 1   AS is_daily
  FROM audience_snapshots
  WHERE platform = 'facebook-personal' AND source = 'scrape' AND followers IS NOT NULL
  WINDOW w AS (ORDER BY recorded_on);

-- 7. On demand runs (migration 011) -------------------------------------------

-- The Sync page writes a request, the laptop's collector claims it, runs the
-- scraper and reports the exit code. At most one request is open at a time.
CREATE TABLE IF NOT EXISTS profile_run_requests (
  id            BIGSERIAL PRIMARY KEY,
  state         TEXT        NOT NULL DEFAULT 'pending'
                CHECK (state IN ('pending', 'running', 'finished', 'expired')),
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  exit_code     INTEGER,
  detail        TEXT,
  CHECK (state = 'pending' OR state = 'expired' OR claimed_at IS NOT NULL),
  CHECK (state <> 'finished' OR (finished_at IS NOT NULL AND exit_code IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS profile_run_requests_one_open
  ON profile_run_requests ((TRUE))
  WHERE state IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS profile_run_requests_requested_at
  ON profile_run_requests (requested_at DESC);
