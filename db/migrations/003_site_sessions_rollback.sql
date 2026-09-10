-- Rollback for migration 003_site_sessions.sql
--
-- Less destructive than the other rollbacks: every row here can be re-fetched
-- from Google Analytics, subject to GA4 data retention on the property, which
-- defaults to 14 months. Anything older than the retention window is gone for
-- good, so check the property setting before dropping years of history.

DROP INDEX IF EXISTS site_sessions_content_idx;
DROP INDEX IF EXISTS site_sessions_date_idx;
DROP INDEX IF EXISTS site_sessions_day_utm_idx;
DROP TABLE IF EXISTS site_sessions;
