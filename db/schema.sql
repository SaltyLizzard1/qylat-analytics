-- QYLAT Analytics schema
-- Run this once in your Neon SQL editor after creating the database.

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
-- One row per social post (populated from Supermetrics or CSV upload).
CREATE TABLE IF NOT EXISTS posts (
  id               SERIAL       PRIMARY KEY,
  platform         VARCHAR(50)  NOT NULL CHECK (platform IN ('instagram','facebook','tiktok','youtube')),
  platform_post_id VARCHAR(255) UNIQUE,         -- native ID from the platform
  format           VARCHAR(50)  CHECK (format IN ('reel','carousel','story','short','bio','other')),
  content_theme    VARCHAR(255),
  published_at     TIMESTAMPTZ,
  caption          TEXT,
  thumbnail_url    TEXT,
  link_slug        VARCHAR(50)  REFERENCES links(slug),  -- the /go/ link used for this post
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS posts_platform_idx    ON posts (platform);
CREATE INDEX IF NOT EXISTS posts_published_at_idx ON posts (published_at DESC);

-- Post metrics table
-- Daily snapshots of per-post platform numbers (from Supermetrics or CSV).
CREATE TABLE IF NOT EXISTS post_metrics (
  id              SERIAL       PRIMARY KEY,
  post_id         INTEGER      NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  recorded_at     TIMESTAMPTZ  DEFAULT NOW(),
  reach           INTEGER,
  impressions     INTEGER,
  engagement      INTEGER,      -- total engagement (likes + comments + saves + shares)
  likes           INTEGER,
  comments        INTEGER,
  saves           INTEGER,
  shares          INTEGER,
  profile_visits  INTEGER,
  link_clicks     INTEGER       -- platform-reported link clicks (vs first-party from click_events)
);

CREATE INDEX IF NOT EXISTS post_metrics_post_id_idx ON post_metrics (post_id);
