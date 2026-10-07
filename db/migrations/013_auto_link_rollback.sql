-- Rollback for migration 013. One statement per run in Vercel's Query box.
--
-- Dropping linked_by and evidence loses the record of which links were made
-- automatically and why. The links themselves stay. Dropping reason loses
-- whether a pair was dismissed or unlinked. The pair stays rejected.
-- Dropping cross_posted loses the marker until the next collection.
-- Turn CONTENT_AUTOLINK off first, or the app will report matching as skipped.

ALTER TABLE content_group_members DROP COLUMN IF EXISTS linked_by;

ALTER TABLE content_group_members DROP COLUMN IF EXISTS evidence;

ALTER TABLE content_group_dismissals DROP COLUMN IF EXISTS reason;

ALTER TABLE profile_posts DROP COLUMN IF EXISTS cross_posted;
