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
-- One row per redirect hit on a /go/ link.
CREATE TABLE IF NOT EXISTS click_events (
  id          BIGSERIAL    PRIMARY KEY,
  slug        VARCHAR(50)  NOT NULL REFERENCES links(slug),
  clicked_at  TIMESTAMPTZ  DEFAULT NOW(),
  referrer    TEXT,
  user_agent  TEXT,
  country     VARCHAR(10),
  session_id  VARCHAR(255)  -- first-party cookie value for joining to on-site behaviour
);

CREATE INDEX IF NOT EXISTS click_events_slug_idx       ON click_events (slug);
CREATE INDEX IF NOT EXISTS click_events_clicked_at_idx ON click_events (clicked_at DESC);

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
  created_at         TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS posts_platform_idx     ON posts (platform);
CREATE INDEX IF NOT EXISTS posts_published_at_idx ON posts (published_at DESC);

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
