-- Rollback for migration 002_audience_snapshots.sql
--
-- DESTRUCTIVE and NOT recoverable. Follower snapshots cannot be re-fetched.
-- The platform APIs expose only a current total and a short rolling window of
-- daily gains, and every manually entered figure, including the personal
-- Facebook profile, exists nowhere else. Dropping this table throws away
-- history permanently.
--
-- Export before running this if there is any doubt:
--   SELECT * FROM audience_snapshots ORDER BY recorded_on;

DROP INDEX IF EXISTS audience_snapshots_recorded_on_idx;
DROP INDEX IF EXISTS audience_snapshots_platform_day_idx;
DROP TABLE IF EXISTS audience_snapshots;
