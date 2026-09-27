-- Rollback for migration 009.
--
-- Restores the legacy is_bot column and refills it from the classification,
-- which is where its value came from anyway. Run this before rolling the code
-- back to anything that predates migration 008.

ALTER TABLE click_events ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE click_events SET is_bot = (classification = 'crawler');

-- Put the legacy sync back in the trigger.
CREATE OR REPLACE FUNCTION click_events_classify() RETURNS TRIGGER
  LANGUAGE plpgsql AS
$trg$
BEGIN
  NEW.classification := classify_click(NEW.user_agent, NEW.referrer);
  NEW.rules_version  := classification_rules_version();
  NEW.is_bot := (NEW.classification = 'crawler');

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

SELECT
  COUNT(*) FILTER (WHERE is_bot)::int     AS flagged_bot,
  COUNT(*) FILTER (WHERE NOT is_bot)::int AS not_flagged,
  COUNT(*)::int                           AS total
FROM click_events;
