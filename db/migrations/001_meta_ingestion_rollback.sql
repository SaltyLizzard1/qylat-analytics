-- Rollback for migration 001_meta_ingestion.sql
-- Run in the Neon SQL editor to reverse that migration.
--
-- DESTRUCTIVE. Dropping these columns deletes every value in them. If any
-- ingestion has run, this throws away the views figures and the per-day
-- snapshot keys, and they can only come back by re-syncing from Meta.
-- Reach, likes, comments, saves, shares, profile_visits and link_clicks are
-- untouched, since those columns predate the migration.
--
-- Order matters: the index goes before the column it is built on.

DROP INDEX IF EXISTS post_metrics_post_day_idx;

ALTER TABLE post_metrics DROP COLUMN IF EXISTS recorded_on;
ALTER TABLE post_metrics DROP COLUMN IF EXISTS views;

ALTER TABLE posts DROP COLUMN IF EXISTS last_synced_at;
ALTER TABLE posts DROP COLUMN IF EXISTS media_product_type;
ALTER TABLE posts DROP COLUMN IF EXISTS permalink;

-- Not reversed on purpose:
--   posts.platform_post_id UNIQUE (posts_platform_post_id_key) predates this
--   migration and is left alone.
--
-- After running this, /api/sync/meta will fail on its first write, because
-- both upserts target columns that no longer exist. Roll the code back too.
