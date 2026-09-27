-- Migration 008: three way click classification, test marking, failure log
--
-- Run once in the Neon SQL editor. Safe to run more than once. Safe to run
-- BEFORE the code that depends on it is deployed: `is_bot` is kept and is now
-- maintained by a trigger, so the currently deployed route handler keeps
-- working unchanged while this is in place.
--
-- WHY THIS EXISTS
--
-- Migration 005 added a single boolean, computed once at insert from a token
-- list that existed twice, in lib/bots.ts and inlined in that migration's SQL.
-- Three problems followed.
--
-- 1. It could not express doubt. Every row was a person or a crawler. Rows 9,
--    12, 35, 43 and 53 are bare desktop Chrome arriving with a www.facebook.com
--    referrer, from US, interleaved second by second with facebookexternalhit
--    bursts, each with a fresh cookie. Meta's own fetchers look exactly like
--    that and so does a person on desktop web. Calling them people inflated
--    every figure on the dashboard.
-- 2. It was not recomputable. The value was frozen at insert, so a rule change
--    split history into before and after with nothing on screen saying so. The
--    005 backfill silently rewrote the 16 Sept totals on 19 Sept.
-- 3. There was no way to exclude Liz's own test clicks, which were 6 of the 21
--    rows the dashboard was calling people.
--
-- WHAT REPLACES IT
--
-- One classifier, classify_click(user_agent, referrer), living in the database
-- and called both by the insert trigger and by the reclassify action. There is
-- no second copy in TypeScript, so the two can no longer drift. Raw rows are
-- never deleted or rewritten by the classifier. Only the derived
-- classification column is, and every row records which rules version produced
-- it.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

ALTER TABLE click_events
  ADD COLUMN IF NOT EXISTS classification VARCHAR(16),
  ADD COLUMN IF NOT EXISTS rules_version  INTEGER,
  ADD COLUMN IF NOT EXISTS is_test        BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- 2. The rules register. Every reclassification stamps its version onto the
--    rows, and the Links and Click Log pages show the date, so a shift in the
--    totals always has a visible reason.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS classification_rules (
  version    INTEGER     PRIMARY KEY,
  changed_on DATE        NOT NULL,
  note       TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO classification_rules (version, changed_on, note) VALUES (
  1,
  '2026-09-27',
  'Three states replace the is_bot boolean. Crawler is a self declared agent, a missing user agent, or the pinned Chrome/74.0.3729.131 string Meta fetches with. Human needs positive evidence: an in app browser token, or an ordinary browser that did not arrive from a Meta domain. A plain browser arriving from facebook.com or instagram.com is uncertain, because Meta own fetchers are indistinguishable from a person on desktop web.'
) ON CONFLICT (version) DO NOTHING;

CREATE OR REPLACE FUNCTION classification_rules_version() RETURNS INTEGER
  LANGUAGE sql STABLE AS
'SELECT COALESCE(MAX(version), 0) FROM classification_rules';

-- ---------------------------------------------------------------------------
-- 3. The classifier. The only place a click is judged.
--
--    Order is load bearing. Crawler evidence is checked before human evidence,
--    and positive human evidence before the ambiguous referrer case, so a real
--    person inside the Facebook app who arrived from www.facebook.com is read
--    from the FBAN token in their user agent and never from the referrer.
--
--    No timing input. Two rows in the same second is a hint, not evidence, and
--    a rule built on it would reclassify differently as traffic grows.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION classify_click(ua TEXT, ref TEXT)
  RETURNS VARCHAR(16)
  LANGUAGE plpgsql IMMUTABLE AS
$fn$
DECLARE
  agent  TEXT := BTRIM(COALESCE(ua, ''));
  origin TEXT := BTRIM(COALESCE(ref, ''));
BEGIN
  -- No user agent at all. Every real browser sends one.
  IF agent = '' THEN
    RETURN 'crawler';
  END IF;

  -- Self declared crawlers, link preview fetchers, AI assistants and HTTP
  -- libraries. Carried over unchanged from lib/bots.ts as of migration 005.
  -- The cost of the generic `bot` token is a rare false positive on CUBOT
  -- branded phones, accepted because nearly every crawler uses that word.
  IF agent ~* '(bot|crawler|spider|facebookexternalhit|facebookcatalog|meta-externalagent|meta-externalfetcher|^whatsapp/|slack-imgproxy|skypeuripreview|embedly|quora link preview|claude-user|chatgpt-user|perplexity-user|anthropic-ai|headlesschrome|curl/|wget/|python-requests|python-urllib|go-http-client|node-fetch|axios/)' THEN
    RETURN 'crawler';
  END IF;

  -- One Meta fetcher that presents as an ordinary browser. Matched on the
  -- exact complete string, never as a substring, so a genuine visitor on a
  -- different 2019 Chrome build is not caught. Observed three times, byte
  -- identical, always US, always with a facebook.com referrer, always with a
  -- fresh cookie, twice inside a facebookexternalhit burst a month apart.
  IF agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.131 Safari/537.36' THEN
    RETURN 'crawler';
  END IF;

  -- Positive evidence of a person: an in app browser token that no crawler
  -- sends. This is the field that actually separates a person reading inside
  -- the Facebook or Instagram app from Meta's preview fetcher.
  IF agent ~* '(FBAN/|FBAV/|FB_IAB|FBCX/|IABMV/|Instagram [0-9]|Instagram/|musical_ly|BytedanceWebview|Line/[0-9]|Twitter for|Pinterest/|Snapchat)' THEN
    RETURN 'human';
  END IF;

  -- An ordinary browser that arrived from a Meta domain. Undecidable: Meta
  -- fetches links with plain browser user agents and a facebook.com referrer,
  -- and so does a person clicking on desktop web. Neither counted nor
  -- discarded.
  IF origin ~* '^https?://([a-z0-9-]+\.)?(facebook|instagram)\.com' THEN
    RETURN 'uncertain';
  END IF;

  -- Anything else that still looks like a browser is a person.
  IF agent ~* '^Mozilla/' THEN
    RETURN 'human';
  END IF;

  RETURN 'uncertain';
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Backfill every existing row from the classifier.
-- ---------------------------------------------------------------------------

UPDATE click_events
SET classification = classify_click(user_agent, referrer),
    rules_version  = classification_rules_version();

ALTER TABLE click_events ALTER COLUMN classification SET DEFAULT 'uncertain';
ALTER TABLE click_events ALTER COLUMN rules_version   SET DEFAULT 0;
ALTER TABLE click_events ALTER COLUMN classification SET NOT NULL;
ALTER TABLE click_events ALTER COLUMN rules_version   SET NOT NULL;

-- The default is 'uncertain' rather than NULL on purpose. If this table is
-- ever written to by an app running against a database where the trigger below
-- is missing, the rows show up as uncertain and are visible in the counts,
-- rather than vanishing from every figure with no trace.

-- ---------------------------------------------------------------------------
-- 5. Liz's own test clicks, marked by browser cookie. Confirmed 2026-09-27.
--    Test rows stay in the table and stay visible. They are excluded from
--    counts, never deleted.
-- ---------------------------------------------------------------------------

UPDATE click_events SET is_test = TRUE
WHERE session_id IN (
  '90c0e2be-6b63-4713-a130-6be7f5c8edeb',  -- 23 Aug x2 and 2 Sep, the 2 Sep hit is NL on a VPN
  'ce24d43c-aee2-4599-a088-6d091a61adb4',  -- 8 Sep x2 and 16 Sep, TH, same Windows Chrome
  '25d7be72-5ea6-403c-ac74-10fb1735c1f7',  -- fb-page-quiz, 27 Sep 10:20, NL on VPN
  'c7f86a41-b5d7-4c5f-91ab-1490ca6c654a'   -- fb-profile-quiz, 27 Sep 10:29, TH
);

-- One cookie looked like Liz's own testing and is NOT. Confirmed 2026-09-27.
--   bf90ae4e-2243-48a2-aaeb-050890661b4a   19 Sep x2, TH, Facebook in app browser
-- It stays counted as a person. Recorded here because the pattern is
-- misleading: two hits 54 minutes apart from Thailand in the Facebook app, on
-- the same day as an audit, with the app version changing between them. All of
-- that reads like a test session and none of it is evidence. Only Liz can say,
-- and she did.

-- ---------------------------------------------------------------------------
-- 6. Classify at insert, and inherit the test flag from the browser cookie.
--    The route handler no longer decides anything: it stores the raw request
--    and the database classifies it. That is what makes reclassification
--    produce the same answer as the original insert.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION click_events_classify() RETURNS TRIGGER
  LANGUAGE plpgsql AS
$trg$
BEGIN
  NEW.classification := classify_click(NEW.user_agent, NEW.referrer);
  NEW.rules_version  := classification_rules_version();

  -- Kept in step for the currently deployed code, which still inserts and
  -- reads this column. Migration 009 drops it once that code is replaced.
  NEW.is_bot := (NEW.classification = 'crawler');

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

DROP TRIGGER IF EXISTS click_events_classify_trg ON click_events;
CREATE TRIGGER click_events_classify_trg
  BEFORE INSERT ON click_events
  FOR EACH ROW EXECUTE FUNCTION click_events_classify();

-- ---------------------------------------------------------------------------
-- 7. Failures. A click that cannot be recorded must leave a trace somewhere
--    the dashboard can show, not only in a Vercel log line nobody reads.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS click_failures (
  id        BIGSERIAL    PRIMARY KEY,
  failed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  slug      VARCHAR(255),          -- no foreign key: an unknown slug is the point
  path      TEXT,
  reason    VARCHAR(40)  NOT NULL, -- insert_failed, unknown_slug, malformed_path
  detail    TEXT
);

CREATE INDEX IF NOT EXISTS click_failures_failed_at_idx ON click_failures (failed_at DESC);

-- ---------------------------------------------------------------------------
-- 8. Views. Every figure on every page reads human_clicks, so there is one
--    definition of a counted click and no page can disagree with another.
--    The column list is unchanged from migration 005, so no caller breaks.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS human_clicks;
CREATE VIEW human_clicks AS
  SELECT id, slug, clicked_at, referrer, user_agent, country, session_id
  FROM click_events
  WHERE classification = 'human' AND NOT is_test;

-- The four states are mutually exclusive and sum to total, so a reader can
-- always check the arithmetic. A test row is counted as a test whatever it
-- was classified as.
CREATE OR REPLACE VIEW click_counts AS
  SELECT
    slug,
    COUNT(*) FILTER (WHERE NOT is_test AND classification = 'human')::int     AS human,
    COUNT(*) FILTER (WHERE NOT is_test AND classification = 'uncertain')::int AS uncertain,
    COUNT(*) FILTER (WHERE NOT is_test AND classification = 'crawler')::int   AS crawler,
    COUNT(*) FILTER (WHERE is_test)::int                                      AS test,
    COUNT(*)::int                                                             AS total
  FROM click_events
  GROUP BY slug;

DROP INDEX IF EXISTS click_events_human_idx;
CREATE INDEX click_events_human_idx ON click_events (slug, clicked_at DESC)
  WHERE classification = 'human' AND NOT is_test;

CREATE INDEX IF NOT EXISTS click_events_session_idx ON click_events (session_id);

-- ---------------------------------------------------------------------------
-- 9. Check the result. Expected on 2026-09-27 across 58 rows:
--    human 10, uncertain 2, crawler 38, test 8.
--    Per slug: ig-bio-quiz 7, fb-reel-quiz 2, fb-post-quiz 1, and 0 people on
--    fb-page-quiz and fb-profile-quiz, whose only hits are Liz's own tests.
-- ---------------------------------------------------------------------------

SELECT
  COUNT(*) FILTER (WHERE NOT is_test AND classification = 'human')::int     AS human,
  COUNT(*) FILTER (WHERE NOT is_test AND classification = 'uncertain')::int AS uncertain,
  COUNT(*) FILTER (WHERE NOT is_test AND classification = 'crawler')::int   AS crawler,
  COUNT(*) FILTER (WHERE is_test)::int                                      AS test,
  COUNT(*)::int                                                             AS total
FROM click_events;
