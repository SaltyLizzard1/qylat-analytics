-- Migration 004: move existing post themes onto the new tag vocabulary
--
-- The theme vocabulary changed on 2026-09-10 from the qylat-social pillars to
-- Liz's own five tags. Ten posts were already tagged with the old slugs, which
-- would otherwise be orphaned: not in the vocabulary, so they render as raw
-- slugs and never group with anything.
--
-- Mapping used:
--   chiang-mai-life    -> life-in-thailand   (settled everyday life)
--   how-the-leap-works -> mechanics          (visas, licences, banking, housing)
--   mindset-shift      -> inspirational      (fear, doubt, deciding)
--   what-im-building   -> promotional        (the tool, asking for a click)
--
-- Re-runnable. Rows already on the new vocabulary are untouched.
--
-- Deliberately NOT touching links.content_theme. Two links carry 'get-unstuck'
-- with 14 clicks between them, and remapping that changes click attribution
-- that Liz may be reading. It is left for her to decide.

UPDATE posts SET content_theme = 'life-in-thailand' WHERE content_theme = 'chiang-mai-life';
UPDATE posts SET content_theme = 'mechanics'        WHERE content_theme = 'how-the-leap-works';
UPDATE posts SET content_theme = 'inspirational'    WHERE content_theme = 'mindset-shift';
UPDATE posts SET content_theme = 'promotional'      WHERE content_theme = 'what-im-building';
