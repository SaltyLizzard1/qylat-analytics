-- Migration 012: linking copies of the same content across accounts
-- NOT APPLIED. Prepared for review. Run once in the Neon SQL editor against
-- PRODUCTION (ep-small-mud-az5opu7m) before the Content page can confirm,
-- link or unlink anything. Safe to run more than once. Until it is run the
-- Content page still loads, shows possible matches, and says linking is off.
--
-- Why a table at all: nothing Meta returns, and nothing the profile collector
-- reads, says that an Instagram post, a Page post and a Profile post are the
-- same piece of content. posts has one row per (platform, platform_post_id)
-- and no field that joins them. A matching caption or a nearby publish time
-- is a hint, and a hint must never merge two posts by itself, so the link is
-- a decision Liz makes and this is where the decision is kept.
--
-- What this does not touch: posts, post_metrics, profile_posts and
-- profile_metrics are not altered and no row in them is written. A group is
-- only a list of post ids. Unlinking deletes membership rows and nothing
-- else, so every original record and observation outlives any grouping.

CREATE TABLE IF NOT EXISTS content_groups (
  id          SERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A post belongs to at most one group, which the primary key enforces.
-- No cascade from posts: post rows are never deleted, and if one ever were,
-- the foreign key should refuse it the way click_events refuses a link.
CREATE TABLE IF NOT EXISTS content_group_members (
  post_id    INTEGER PRIMARY KEY REFERENCES posts(id),
  group_id   INTEGER NOT NULL REFERENCES content_groups(id) ON DELETE CASCADE,
  linked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_group_members_group ON content_group_members (group_id);

-- A suggested match Liz said is not the same content, so it is not offered
-- again. Stored smaller id first, so a pair has one row whichever way round
-- it was suggested.
CREATE TABLE IF NOT EXISTS content_group_dismissals (
  post_a        INTEGER NOT NULL REFERENCES posts(id),
  post_b        INTEGER NOT NULL REFERENCES posts(id),
  dismissed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_a, post_b),
  CHECK (post_a < post_b)
);
