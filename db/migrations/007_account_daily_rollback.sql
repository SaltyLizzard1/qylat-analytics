-- Rollback for migration 007.
--
-- Roll the code back FIRST. The Meta sync writes account_daily and the
-- overview reads it, so dropping the table while that code is live fails the
-- sync and breaks the first screen.
--
-- This discards every account level daily figure. Meta only serves recent
-- days, so what is dropped cannot all be fetched again.

DROP TABLE IF EXISTS account_daily;
