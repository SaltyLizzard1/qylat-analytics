-- Migration 006: Page updates that Facebook returns as posts
-- Run once in the Neon SQL editor, BEFORE deploying the code that reads
-- content_posts. Safe to run more than once.
--
-- The Page /posts edge returns a row for every cover photo and profile
-- picture change, with no caption and a permalink carrying substory_index=.
-- On 2026-09-19 production held 8 of them, stored as format "other" with 0 to
-- 9 views each. They dragged the Facebook median from 42 views to 24 and
-- raised a false "facebook other underperforms" alert.
--
-- Nothing is deleted. Each row keeps its place in posts with page_update set
-- to the reason Facebook gives ("cover photo", "profile picture", or its own
-- story text). The overview raises an attention item listing them, and the
-- admin posts screen shows them under a Page updates filter. Every figure
-- reads the content_posts view instead, so a cover photo change never counts
-- as a post again.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS page_update TEXT;

-- One time backfill of the 8 rows present on 2026-09-19. Two reasons are
-- known from a direct Graph API read; the rest are filled in by the next sync
-- for any row Meta still returns, and stay marked "not fetched" otherwise.
UPDATE posts SET page_update = 'cover photo'
WHERE platform_post_id = '1309988685522893_4568433843441682' AND page_update IS NULL;

UPDATE posts SET page_update = 'profile picture'
WHERE platform_post_id = '1309988685522893_122100916545435981' AND page_update IS NULL;

UPDATE posts SET page_update = 'reason not fetched yet'
WHERE platform = 'facebook'
  AND permalink LIKE '%substory_index=%'
  AND page_update IS NULL;

-- Posts that count. Columns are listed rather than SELECT *, so a column
-- added to posts later has to be added here on purpose.
CREATE OR REPLACE VIEW content_posts AS
  SELECT id, platform, platform_post_id, format, media_product_type, content_theme,
         published_at, caption, thumbnail_url, permalink, link_slug,
         last_synced_at, created_at
  FROM posts
  WHERE page_update IS NULL;

-- Check the result. Expected on 2026-09-19: 8 rows flagged, 76 content posts.
SELECT (page_update IS NOT NULL) AS is_page_update, COUNT(*)::int AS rows
FROM posts GROUP BY 1 ORDER BY 1;
