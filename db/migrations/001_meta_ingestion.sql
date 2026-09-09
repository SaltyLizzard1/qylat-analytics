-- Migration 001: Meta Graph API ingestion
-- Run once in the Neon SQL editor. Safe to run more than once.
--
-- Why: the posts and post_metrics tables were designed for Supermetrics, which
-- was never built. Ingestion now comes straight from the Facebook Page and the
-- linked Instagram account, which needs three things this schema lacks:
--   1. a permalink and product type on posts, so the leaderboard can link out
--   2. a `views` column, because Meta retired impressions on both platforms
--   3. one metrics row per post per day, so a repeated sync updates instead of
--      piling up duplicate snapshots

ALTER TABLE posts ADD COLUMN IF NOT EXISTS permalink          TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_product_type VARCHAR(50);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS last_synced_at     TIMESTAMPTZ;

-- Meta deprecated impressions on both platforms:
--   Instagram media created after 2024-07-02 report `views`, not `impressions`.
--   Facebook post_impressions became post_media_view.
-- The old impressions column stays for historical rows and is no longer written.
ALTER TABLE post_metrics ADD COLUMN IF NOT EXISTS views INTEGER;

-- One snapshot per post per calendar day.
ALTER TABLE post_metrics
  ADD COLUMN IF NOT EXISTS recorded_on DATE NOT NULL DEFAULT CURRENT_DATE;

CREATE UNIQUE INDEX IF NOT EXISTS post_metrics_post_day_idx
  ON post_metrics (post_id, recorded_on);

-- Note: posts.platform_post_id already carries a UNIQUE constraint
-- (posts_platform_post_id_key), which is what the sync upsert conflicts on.
-- No extra index needed.
