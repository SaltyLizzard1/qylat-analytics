-- Migration 011: on demand runs of the personal profile scraper
-- Run once in the Neon SQL editor against PRODUCTION (ep-small-mud-az5opu7m),
-- BEFORE deploying the "Collect Facebook profile" button. Safe to run more
-- than once.
--
-- The scraper can only run on the laptop, beside the logged in Chrome
-- profile, so the dashboard cannot start it. Instead the Sync page writes a
-- request here and the laptop's collector (scripts/personal-fb/collect.py) claims
-- it, runs the scraper and reports the exit code back.
--
-- A request moves pending -> running -> finished, or to expired when nothing
-- picks it up or reports back in time. At most one request is open (pending
-- or running) at any moment, so pressing the button twice never queues two
-- runs of the scraper against Facebook.

CREATE TABLE IF NOT EXISTS profile_run_requests (
  id            BIGSERIAL PRIMARY KEY,
  state         TEXT        NOT NULL DEFAULT 'pending'
                CHECK (state IN ('pending', 'running', 'finished', 'expired')),
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  -- The scraper's own exit code, as documented in scripts/personal-fb/README.md.
  exit_code     INTEGER,
  -- The last lines the scraper logged during the run, sent by the collector.
  detail        TEXT,
  CHECK (state = 'pending' OR state = 'expired' OR claimed_at IS NOT NULL),
  CHECK (state <> 'finished' OR (finished_at IS NOT NULL AND exit_code IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS profile_run_requests_one_open
  ON profile_run_requests ((TRUE))
  WHERE state IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS profile_run_requests_requested_at
  ON profile_run_requests (requested_at DESC);
