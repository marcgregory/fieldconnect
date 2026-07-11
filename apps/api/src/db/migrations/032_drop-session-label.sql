-- Sprint 6, Phase 5 — Session Security cleanup
--
-- Remove the unused `label` column from sessions.
-- The UI derives a display label from `user_agent` instead.
-- This column was a placeholder for future custom device naming
-- and had no current readers or writers.

ALTER TABLE sessions DROP COLUMN IF EXISTS label;
