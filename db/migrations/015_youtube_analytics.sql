-- Migration 015: YouTube Analytics through OAuth
-- NOT APPLIED. Prepared for review. Run against PRODUCTION
-- (ep-small-mud-az5opu7m) before the channel is connected. Safe to run more
-- than once.
--
-- Vercel's Storage > Query box takes ONE statement per run. The whole
-- migration is written as one DO block, which is one statement and runs in
-- one transaction: either every table below exists afterwards or none does.
--
-- Nothing existing is altered. Four new tables:
--
--   youtube_oauth            the one connected channel. The refresh token is
--                            stored only encrypted (AES-256-GCM, key in the
--                            YOUTUBE_TOKEN_KEY environment variable), never
--                            in plain text, never returned to a browser. One
--                            row at most.
--   youtube_analytics_daily  one row per YouTube report day: views, watch
--                            time, average view duration and percentage,
--                            subscribers gained and lost. A metric YouTube
--                            did not return stays NULL, never 0. Activity on
--                            that day, not a running total.
--   youtube_traffic_daily    views and watch time per traffic source per day.
--                            A source YouTube did not report on a day has no
--                            row, which is not the same as zero.
--   youtube_analytics_runs   each read: the range asked for, the last day
--                            YouTube had finished processing, counts, and the
--                            error if it failed. The dashboard reads its
--                            "data through" date from here.
--
-- Stored analytics are deleted when the channel is disconnected from the
-- admin screen, and by the sync once access has not been confirmed for 30
-- days, as the YouTube API Services Developer Policies require.

DO $mig015$
BEGIN
  CREATE TABLE IF NOT EXISTS youtube_oauth (
    id                SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    channel_id        TEXT NOT NULL,
    channel_title     TEXT,
    refresh_token_enc TEXT,
    scopes            TEXT NOT NULL,
    status            TEXT NOT NULL CHECK (status IN ('connected', 'revoked', 'failing')),
    connected_at      TIMESTAMPTZ NOT NULL,
    verified_at       TIMESTAMPTZ,
    revoked_at        TIMESTAMPTZ,
    last_error        TEXT,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS youtube_analytics_daily (
    day                           DATE PRIMARY KEY,
    views                         BIGINT,
    estimated_minutes_watched     BIGINT,
    average_view_duration_seconds INTEGER,
    average_view_percentage       NUMERIC(7, 2),
    subscribers_gained            INTEGER,
    subscribers_lost              INTEGER,
    channel_id                    TEXT NOT NULL,
    source                        TEXT NOT NULL,
    fetched_at                    TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS youtube_traffic_daily (
    day                       DATE NOT NULL,
    source_type               TEXT NOT NULL,
    views                     BIGINT,
    estimated_minutes_watched BIGINT,
    channel_id                TEXT NOT NULL,
    source                    TEXT NOT NULL,
    fetched_at                TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (day, source_type)
  );

  CREATE TABLE IF NOT EXISTS youtube_analytics_runs (
    id           SERIAL PRIMARY KEY,
    started_at   TIMESTAMPTZ NOT NULL,
    finished_at  TIMESTAMPTZ NOT NULL,
    ok           BOOLEAN NOT NULL,
    start_date   DATE,
    end_date     DATE,
    data_through DATE,
    daily_rows   INTEGER,
    traffic_rows INTEGER,
    error        TEXT
  );
END
$mig015$;
