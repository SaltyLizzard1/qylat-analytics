-- Rollback for migration 012. Removes every link and every dismissed
-- suggestion. Posts and their figures are not touched.

DROP TABLE IF EXISTS content_group_dismissals;
DROP TABLE IF EXISTS content_group_members;
DROP TABLE IF EXISTS content_groups;
