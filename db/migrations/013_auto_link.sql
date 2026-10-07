-- Migration 013: automatic linking of high-confidence matches
-- NOT APPLIED. Prepared for review. Run against PRODUCTION
-- (ep-small-mud-az5opu7m) after migration 012. Safe to run more than once.
--
-- Vercel's Storage > Query box takes ONE statement per run. Run each of the
-- four statements below by itself, in order. Neon's own SQL editor would take
-- the whole file.
--
-- What it adds, and why:
--
--   content_group_members.linked_by   'manual' or 'auto'. Every existing row
--                                     is a link Liz made, so the default is
--                                     'manual' and nothing is relabelled.
--   content_group_members.evidence    what the matcher saw when it linked a
--                                     post: the rule, the caption length, the
--                                     widest publish gap, the tolerance, and
--                                     Facebook's Cross posted marker.
--   content_group_dismissals.reason   'dismissed' (said "Not the same") or
--                                     'unlinked' (took a post out of a group).
--                                     Either way the pair is never linked
--                                     automatically again.
--   profile_posts.cross_posted        Facebook's own "Cross posted" label on a
--                                     Profile post, as the collector read it.
--                                     Supporting evidence only: it says the
--                                     post has an Instagram twin, not which.
--
-- What it does not touch: no post, figure or observation is altered, and no
-- existing link or dismissal changes meaning. Until it is run the Content
-- page works as it does now and automatic linking stays off.

ALTER TABLE content_group_members
  ADD COLUMN IF NOT EXISTS linked_by TEXT NOT NULL DEFAULT 'manual' CHECK (linked_by IN ('manual', 'auto'));

ALTER TABLE content_group_members
  ADD COLUMN IF NOT EXISTS evidence JSONB;

ALTER TABLE content_group_dismissals
  ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT 'dismissed' CHECK (reason IN ('dismissed', 'unlinked'));

ALTER TABLE profile_posts
  ADD COLUMN IF NOT EXISTS cross_posted BOOLEAN;
