-- Migration 002: audience snapshots
-- Run once in the Neon SQL editor. Safe to run more than once.
--
-- Follower counts are a moving number with no history in the platform APIs
-- beyond a short window, so they have to be captured as they happen. One row
-- per account per day.
--
-- `source` separates what an API reported from what was typed in by hand.
-- The personal Facebook profile has no Graph API surface of any kind, so it
-- can only ever be manual. Same for TikTok and YouTube until those are wired.

CREATE TABLE IF NOT EXISTS audience_snapshots (
  id            SERIAL       PRIMARY KEY,
  recorded_on   DATE         NOT NULL DEFAULT CURRENT_DATE,
  platform      VARCHAR(50)  NOT NULL CHECK (platform IN (
                  'instagram','facebook','facebook-personal','tiktok','youtube'
                )),
  account_label VARCHAR(100),
  followers     INTEGER,      -- total at the time of the snapshot
  new_followers INTEGER,      -- gain on that day, where the platform reports it
  source        VARCHAR(20)  NOT NULL DEFAULT 'api' CHECK (source IN ('api','manual')),
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- One snapshot per account per day, so a repeated sync updates in place.
CREATE UNIQUE INDEX IF NOT EXISTS audience_snapshots_platform_day_idx
  ON audience_snapshots (platform, recorded_on);

CREATE INDEX IF NOT EXISTS audience_snapshots_recorded_on_idx
  ON audience_snapshots (recorded_on DESC);
