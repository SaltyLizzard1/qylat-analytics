-- Rollback for migration 010.
--
-- Roll the code back FIRST. /api/ingest/personal writes platform
-- 'facebook-personal' and source 'scrape', and every insert fails once the
-- old checks are restored.
--
-- This refuses to run while collected data exists, and says how much. The old
-- checks cannot be restored over it, and deleting it is a decision, not a side
-- effect of a rollback. To discard it on purpose, run these first, in order:
--   DELETE FROM profile_metrics;
--   DELETE FROM profile_posts;
--   DELETE FROM posts WHERE platform = 'facebook-personal';
--   DELETE FROM profile_collections;
--   DELETE FROM audience_snapshots WHERE source = 'scrape';
-- and then run this file again. Manual audience rows are never touched.

DO $$
DECLARE
  n_posts INTEGER;
  n_scrape INTEGER;
  n_collections INTEGER;
BEGIN
  SELECT COUNT(*) INTO n_posts FROM posts WHERE platform = 'facebook-personal';
  SELECT COUNT(*) INTO n_scrape FROM audience_snapshots WHERE source = 'scrape';
  SELECT COUNT(*) INTO n_collections FROM profile_collections;
  IF n_posts > 0 OR n_scrape > 0 OR n_collections > 0 THEN
    RAISE EXCEPTION
      'Rollback refused: % facebook-personal posts, % scraped audience rows, % collections. Delete them on purpose first.',
      n_posts, n_scrape, n_collections;
  END IF;
END $$;

DROP VIEW IF EXISTS profile_follower_changes;
DROP VIEW IF EXISTS profile_metrics_latest;
DROP TABLE IF EXISTS profile_metrics;
DROP TABLE IF EXISTS profile_posts;
DROP TABLE IF EXISTS profile_collections;

ALTER TABLE audience_snapshots DROP CONSTRAINT IF EXISTS audience_snapshots_source_check;
ALTER TABLE audience_snapshots ADD CONSTRAINT audience_snapshots_source_check
  CHECK (source IN ('api','manual'));

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_platform_check;
ALTER TABLE posts ADD CONSTRAINT posts_platform_check
  CHECK (platform IN ('instagram','facebook','tiktok','youtube'));

CREATE OR REPLACE VIEW content_posts AS
  SELECT id, platform, platform_post_id, format, media_product_type, content_theme,
         published_at, caption, thumbnail_url, permalink, link_slug,
         last_synced_at, created_at
  FROM posts
  WHERE page_update IS NULL;
