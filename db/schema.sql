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
CREATE TABLE IF NOT EXISTS posts (
  id                 SERIAL       PRIMARY KEY,
  platform           VARCHAR(50)  NOT NULL CHECK (platform IN ('instagram','facebook','tiktok','youtube')),
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
-- stay in posts, flagged, and the overview lists them.
CREATE OR REPLACE VIEW content_posts AS
  SELECT id, platform, platform_post_id, format, media_product_type, content_theme,
         published_at, caption, thumbnail_url, permalink, link_slug,
         last_synced_at, created_at
  FROM posts
  WHERE page_update IS NULL;

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
