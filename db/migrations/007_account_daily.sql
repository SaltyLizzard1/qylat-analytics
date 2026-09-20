-- Migration 007: account level insights, one row per day per metric
-- Run once in the Neon SQL editor, BEFORE deploying the code that writes it.
-- Safe to run more than once.
--
-- post_metrics answers "how did this post do". This table answers "how did
-- the account do on this day": reach and views split into followers and
-- non-followers, views by format, profile visits, follows, and the Facebook
-- Page equivalents. It feeds the platform cards on the overview.
--
-- Rows are keyed by Meta's own metric name and breakdown value, so a metric
-- Meta adds tomorrow needs no schema change. `dimension` is 'total' for an
-- unbroken figure, or the breakdown value such as FOLLOWER, NON_FOLLOWER or
-- REEL. Instagram figures come from a total_value read of one day at a time,
-- Facebook figures from the Page's daily series. Both syncs re-read a short
-- window and overwrite, since Meta revises recent days.

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

SELECT COUNT(*)::int AS rows FROM account_daily;
