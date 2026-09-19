-- Migration 005: flag crawler hits on /go/ links
-- Run once in the Neon SQL editor, BEFORE deploying the code that reads
-- human_clicks. Safe to run more than once.
--
-- Production, 2026-09-19: 30 of 50 click_events rows had the user agent
-- facebookexternalhit, the crawler Meta sends to build a link preview. Counted
-- as clicks, they made 13 real Instagram clicks look like 35 and produced a
-- false "traffic is not arriving" alert.
--
-- Nothing is deleted. Crawler rows stay in click_events, flagged, because the
-- log is the record of what happened. Every figure reads the human_clicks view
-- instead, so there is one definition of a human click rather than a filter
-- repeated in a dozen queries. The exception is deleteLink, which must keep
-- counting click_events itself: the foreign key to links.slug covers crawler
-- rows too.

ALTER TABLE click_events ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE;

-- One time backfill. This list mirrors BOT_TOKENS in lib/bots.ts as of this
-- migration. New rows are flagged at insert by app/go/[slug]/route.ts.
UPDATE click_events
SET is_bot = TRUE
WHERE is_bot = FALSE
  AND (
    user_agent IS NULL
    OR BTRIM(user_agent) = ''
    OR user_agent ~* '(bot|crawler|spider|facebookexternalhit|facebookcatalog|meta-externalagent|meta-externalfetcher|^whatsapp/|slack-imgproxy|skypeuripreview|embedly|quora link preview|claude-user|chatgpt-user|perplexity-user|anthropic-ai|headlesschrome|curl/|wget/|python-requests|python-urllib|go-http-client|node-fetch|axios/)'
  );

CREATE OR REPLACE VIEW human_clicks AS
  SELECT id, slug, clicked_at, referrer, user_agent, country, session_id
  FROM click_events
  WHERE is_bot = FALSE;

CREATE INDEX IF NOT EXISTS click_events_human_idx
  ON click_events (slug, clicked_at DESC) WHERE is_bot = FALSE;

-- Check the result. Expected on 2026-09-19: 30 flagged plus one Claude-User
-- hit, so 31 bots and 19 humans out of 50.
SELECT is_bot, COUNT(*)::int AS clicks FROM click_events GROUP BY is_bot ORDER BY is_bot;
