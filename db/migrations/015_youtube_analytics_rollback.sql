-- Rollback for migration 015. One statement, one transaction.
--
-- Dropping these tables deletes the stored refresh token and every stored
-- analytics row. Disconnect from /admin/youtube first, so the token is also
-- revoked at Google; dropping the table alone leaves the grant live in the
-- Google account until it is removed at myaccount.google.com/permissions.
-- Nothing else in the database refers to these tables.

DO $rb015$
BEGIN
  DROP TABLE IF EXISTS youtube_analytics_runs;
  DROP TABLE IF EXISTS youtube_traffic_daily;
  DROP TABLE IF EXISTS youtube_analytics_daily;
  DROP TABLE IF EXISTS youtube_oauth;
END
$rb015$;
