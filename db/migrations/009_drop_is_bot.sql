-- Migration 009: drop the legacy is_bot column
--
-- RUN THIS ONLY AFTER the code from migration 008 is deployed and verified.
--
-- Ordering matters and this is the one place it can bite. Migration 008 keeps
-- is_bot alive and in step with classification, so it is safe to run 008 while
-- the pre-008 route handler is still live: that handler names is_bot in its
-- INSERT and would fail without the column. Its failure path was a bare
-- console.error, so every click would have vanished silently until the deploy
-- landed. That is the exact class of bug this whole change exists to remove.
--
-- So: run 008, deploy, confirm the Click Log and the Links page read correctly,
-- then run this.
--
-- Nothing is lost. is_bot has been a duplicate of (classification = 'crawler')
-- since 008, and the classification is recomputable from the stored user agent
-- at any time.

ALTER TABLE click_events DROP COLUMN IF EXISTS is_bot;

-- Drop the legacy sync line from the trigger now that the column is gone.
CREATE OR REPLACE FUNCTION click_events_classify() RETURNS TRIGGER
  LANGUAGE plpgsql AS
$trg$
BEGIN
  NEW.classification := classify_click(NEW.user_agent, NEW.referrer);
  NEW.rules_version  := classification_rules_version();

  -- Once a browser is marked as Liz's, later clicks from it are tests too.
  IF NOT NEW.is_test AND COALESCE(NEW.session_id, '') <> '' THEN
    IF EXISTS (
      SELECT 1 FROM click_events
      WHERE session_id = NEW.session_id AND is_test
    ) THEN
      NEW.is_test := TRUE;
    END IF;
  END IF;

  RETURN NEW;
END;
$trg$;

-- Confirm nothing reads the column any more.
SELECT COUNT(*)::int AS columns_named_is_bot
FROM information_schema.columns
WHERE table_name = 'click_events' AND column_name = 'is_bot';
