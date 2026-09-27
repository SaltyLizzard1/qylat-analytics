-- Rollback for migration 008.
--
-- Roll the CODE back first. app/go/[...slug]/route.ts inserts without a
-- classification and relies on the trigger, and every admin page reads
-- classification, is_test, click_counts and classification_rules. Dropping
-- those while that code is live breaks the Click Log and the Links page.
--
-- Nothing here deletes a click. Dropping these columns discards the derived
-- verdicts and the test marks, not the rows. The raw user agent and referrer
-- survive, so running 008 again reproduces the same classification for every
-- row. The test marks do not come back, because nothing else records them:
-- note the cookie ids from the Click Log first if you care about them.

DROP TRIGGER IF EXISTS click_events_classify_trg ON click_events;
DROP FUNCTION IF EXISTS click_events_classify();

DROP VIEW IF EXISTS click_counts;
DROP VIEW IF EXISTS human_clicks;
DROP INDEX IF EXISTS click_events_human_idx;
DROP INDEX IF EXISTS click_events_session_idx;

-- Restore the migration 005 view, which reads the legacy boolean. 008 keeps
-- is_bot in step with the classification, so this is accurate on return.
CREATE OR REPLACE VIEW human_clicks AS
  SELECT id, slug, clicked_at, referrer, user_agent, country, session_id
  FROM click_events
  WHERE is_bot = FALSE;

CREATE INDEX IF NOT EXISTS click_events_human_idx
  ON click_events (slug, clicked_at DESC) WHERE is_bot = FALSE;

ALTER TABLE click_events
  DROP COLUMN IF EXISTS classification,
  DROP COLUMN IF EXISTS rules_version,
  DROP COLUMN IF EXISTS is_test;

DROP FUNCTION IF EXISTS classify_click(TEXT, TEXT);
DROP FUNCTION IF EXISTS classification_rules_version();

DROP TABLE IF EXISTS classification_rules;

-- click_failures is left in place deliberately. It holds the record of hits
-- that were never counted, which is evidence about the past rather than part
-- of the classification scheme. Drop it by hand if you really want it gone.
-- DROP TABLE IF EXISTS click_failures;
