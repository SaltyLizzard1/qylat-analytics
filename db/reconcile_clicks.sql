-- Reconciliation: check the dashboard against the raw table, any time.
--
-- Paste the whole file into the Neon SQL editor against PRODUCTION
-- (ep-small-mud-az5opu7m, ap-southeast-1). The development database
-- ep-sweet-unit-aygqfu6j is effectively empty and a plain `vercel env pull`
-- points at it, so check the endpoint in the connection string before
-- believing any number here.
--
-- Query 1 is the one to trust. Its "human" column is the number the Links page
-- shows large, and the same number every dashboard figure counts, because both
-- read the human_clicks view which is defined from exactly this condition.

-- ---------------------------------------------------------------------------
-- 1. Per slug, counts by classification. The four states are mutually
--    exclusive and sum to total, so any row where they do not is a bug.
-- ---------------------------------------------------------------------------

SELECT
  l.slug,
  l.platform,
  l.format,
  COALESCE(c.human,     0) AS human,
  COALESCE(c.uncertain, 0) AS uncertain,
  COALESCE(c.crawler,   0) AS crawler,
  COALESCE(c.test,      0) AS test,
  COALESCE(c.total,     0) AS total,
  COALESCE(c.human, 0) + COALESCE(c.uncertain, 0)
    + COALESCE(c.crawler, 0) + COALESCE(c.test, 0) = COALESCE(c.total, 0) AS adds_up
FROM links l
LEFT JOIN click_counts c ON c.slug = l.slug
ORDER BY COALESCE(c.human, 0) DESC, l.slug;

-- ---------------------------------------------------------------------------
-- 2. The same totals straight from click_events, not through the view.
--    If this disagrees with query 1, the view definition has drifted.
-- ---------------------------------------------------------------------------

SELECT
  COUNT(*) FILTER (WHERE NOT is_test AND classification = 'human')::int     AS human,
  COUNT(*) FILTER (WHERE NOT is_test AND classification = 'uncertain')::int AS uncertain,
  COUNT(*) FILTER (WHERE NOT is_test AND classification = 'crawler')::int   AS crawler,
  COUNT(*) FILTER (WHERE is_test)::int                                      AS test,
  COUNT(*)::int                                                             AS total,
  (SELECT COUNT(*)::int FROM human_clicks)                                  AS view_says_human
FROM click_events;

-- ---------------------------------------------------------------------------
-- 3. Does every stored classification still match what the current rules say?
--    Any row here was judged by older rules. Press "Reclassify all clicks" on
--    the Click Log, or run the UPDATE in query 7.
-- ---------------------------------------------------------------------------

SELECT
  COUNT(*)::int AS rows_disagreeing_with_current_rules
FROM click_events
WHERE classification <> classify_click(user_agent, referrer)
   OR rules_version  <> classification_rules_version();

-- ---------------------------------------------------------------------------
-- 4. Which rules version is in force, and since when.
-- ---------------------------------------------------------------------------

SELECT version, changed_on, note FROM classification_rules ORDER BY version DESC;

-- ---------------------------------------------------------------------------
-- 5. Clicks against GA4 sessions per slug.
--
--    These are DIFFERENT UNITS and will not match. A /go/ click is one
--    redirect. A GA4 session is a visit, and GA4 re-credits a returning
--    visitor to the same utm_content in a later session, so sessions above
--    clicks is normal and does not mean clicks were lost. Clicks above
--    sessions is also normal: in-app browsers, ad blockers and consent banners
--    all stop the GA script running.
--
--    What IS worth investigating: a slug with sessions and zero clicks on days
--    when the /go/ route logged nothing at all. Check query 6.
-- ---------------------------------------------------------------------------

SELECT
  l.slug,
  COALESCE(c.human, 0)                  AS clicks_from_people,
  COALESCE(SUM(s.sessions), 0)::int     AS ga_sessions,
  COALESCE(SUM(s.active_users), 0)::int AS ga_users
FROM links l
LEFT JOIN click_counts c  ON c.slug = l.slug
LEFT JOIN site_sessions s ON s.content = l.slug
GROUP BY l.slug, c.human
ORDER BY clicks_from_people DESC, l.slug;

-- ---------------------------------------------------------------------------
-- 6. Hits that reached the redirect and were not counted, most recent first.
--    An empty result is the healthy state.
-- ---------------------------------------------------------------------------

SELECT failed_at, slug, path, reason, detail
FROM click_failures
ORDER BY failed_at DESC
LIMIT 50;

-- ---------------------------------------------------------------------------
-- 7. Rejudge every click from its stored user agent.
--    The Click Log button does exactly this. Uncomment to run by hand.
--    It rewrites only the derived columns. No raw field is touched.
-- ---------------------------------------------------------------------------

-- UPDATE click_events
-- SET classification = classify_click(user_agent, referrer),
--     rules_version  = classification_rules_version();

-- ---------------------------------------------------------------------------
-- 8. The evidence behind any one verdict, for spot checking.
--    Swap the slug for whichever link you are reading.
-- ---------------------------------------------------------------------------

SELECT
  id,
  clicked_at AT TIME ZONE 'Asia/Bangkok' AS clicked_ict,
  classification,
  is_test,
  country,
  referrer,
  user_agent,
  session_id
FROM click_events
WHERE slug = 'ig-bio-quiz'
ORDER BY clicked_at DESC;
