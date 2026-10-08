-- Rollback for migration 014. One statement per run in Vercel's Query box.
--
-- Statement 2 fails while any post has the format 'video', which is the
-- constraint doing its job. To roll back fully, the YouTube rows have to go
-- first, and deleting posts is refused while they are linked into a content
-- group or have metrics. Unlink them, then delete their metrics, then the
-- posts. That is deliberate: nothing here deletes data for you.
-- The columns can be dropped at any time. Dropping them loses the title,
-- duration, source and scope recorded for YouTube rows.

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_format_check;

ALTER TABLE posts ADD CONSTRAINT posts_format_check
  CHECK (format IN ('reel', 'carousel', 'story', 'short', 'bio', 'other'));

ALTER TABLE posts DROP COLUMN IF EXISTS title, DROP COLUMN IF EXISTS duration_seconds;

ALTER TABLE post_metrics DROP COLUMN IF EXISTS source, DROP COLUMN IF EXISTS scope;

DROP INDEX IF EXISTS posts_platform_published;
