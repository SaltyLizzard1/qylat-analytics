-- Rollback for migration 005.
--
-- Roll the code back FIRST. Every dashboard query reads human_clicks, and
-- app/go/[slug]/route.ts inserts is_bot, so dropping either while that code is
-- live breaks the dashboard and loses new clicks.
--
-- Dropping the column discards the bot classification, not the clicks. The
-- rows themselves are untouched.

DROP VIEW IF EXISTS human_clicks;
DROP INDEX IF EXISTS click_events_human_idx;
ALTER TABLE click_events DROP COLUMN IF EXISTS is_bot;
