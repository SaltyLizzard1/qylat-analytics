-- Rollback for migration 011. Removes the run request history with it.
DROP TABLE IF EXISTS profile_run_requests;
