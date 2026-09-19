-- Rollback for migration 006.
--
-- Roll the code back FIRST. Every dashboard query reads content_posts and the
-- sync writes page_update, so dropping either while that code is live breaks
-- the dashboard and fails every upsert.
--
-- Dropping the column discards the classification, not the rows.

DROP VIEW IF EXISTS content_posts;
ALTER TABLE posts DROP COLUMN IF EXISTS page_update;
