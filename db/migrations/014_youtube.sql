-- Migration 014: YouTube videos
-- NOT APPLIED. Prepared for review. Run against PRODUCTION
-- (ep-small-mud-az5opu7m) before the YouTube sync is first called. Safe to
-- run more than once.
--
-- Vercel's Storage > Query box takes ONE statement per run. Run each of the
-- five statements below by itself, in order.
--
-- posts, post_metrics and audience_snapshots already accept the platform
-- 'youtube', and have since migration 001. What they lack:
--
--   posts.format          has no value for an ordinary video. 'video' is
--                         added beside the existing 'short'. Statements 1 and
--                         2 replace the check with the same list plus 'video'.
--                         No existing row is affected.
--   posts.title           a YouTube video has a title and a description. The
--                         two are stored together in caption, title first, so
--                         every existing screen shows the title where it
--                         shows the first line of a caption. The title is
--                         also kept by itself here.
--   posts.duration_seconds  the video's length, from the API. Recorded, and
--                         never used to decide that a video is a Short.
--   post_metrics.source   where a snapshot came from. Written by the YouTube
--   post_metrics.scope    sync as 'youtube-data-api-v3' and 'lifetime'. Left
--                         null on every existing row: nothing stored is
--                         relabelled. Meta's rows remain what the Meta sync
--                         has always written, a running total read that day.
--
-- Nothing is deleted and no figure is changed.

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_format_check;

ALTER TABLE posts ADD CONSTRAINT posts_format_check
  CHECK (format IN ('reel', 'carousel', 'story', 'short', 'video', 'bio', 'other'));

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

ALTER TABLE post_metrics
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IN ('lifetime', 'period', 'unknown'));

CREATE INDEX IF NOT EXISTS posts_platform_published ON posts (platform, published_at DESC);
