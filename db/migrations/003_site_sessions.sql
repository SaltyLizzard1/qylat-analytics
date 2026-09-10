-- Migration 003: site sessions from Google Analytics 4
-- Run once in the Neon SQL editor. Safe to run more than once.
--
-- One row per day per UTM combination, as GA4 reports it.
--
-- `content` is the join key that makes this table worth having. lib/utm.ts
-- stamps utm_content with the /go/ link slug, GA4 reports it back as
-- sessionManualAdContent, so a session here joins to links.slug and from there
-- to a platform, a format and a content theme.
--
-- Every dimension is NOT NULL with a '(not set)' default on purpose. Postgres
-- treats NULLs as distinct in a unique index, so a nullable dimension would
-- let duplicate rows through for the same day and the upsert would stop
-- working.

CREATE TABLE IF NOT EXISTS site_sessions (
  id               SERIAL       PRIMARY KEY,
  session_date     DATE         NOT NULL,
  source           VARCHAR(255) NOT NULL DEFAULT '(not set)',
  medium           VARCHAR(255) NOT NULL DEFAULT '(not set)',
  campaign         VARCHAR(255) NOT NULL DEFAULT '(not set)',
  content          VARCHAR(255) NOT NULL DEFAULT '(not set)',
  sessions         INTEGER,
  engaged_sessions INTEGER,
  active_users     INTEGER,
  key_events       INTEGER,
  synced_at        TIMESTAMPTZ  DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS site_sessions_day_utm_idx
  ON site_sessions (session_date, source, medium, campaign, content);

CREATE INDEX IF NOT EXISTS site_sessions_date_idx    ON site_sessions (session_date DESC);
CREATE INDEX IF NOT EXISTS site_sessions_content_idx ON site_sessions (content);
