-- Migration 035: Add unique constraint on rework_requests to prevent duplicate rework cycles
--
-- Problem: rework_requests had no database-level UNIQUE constraint, allowing
-- duplicate rows for the same schedule + technician. This caused phantom
-- "Rework Cycle #2" in the review UI when only one rework was actually requested.
--
-- Fix:
--   1. Remove duplicate rows (keep the earliest per schedule + technician + status)
--   2. Add UNIQUE (schedule_id, technician_id) with partial unique indexes
--   3. The app-level guard (getLatestOpenRework check) stays as a first line of defense

-- ─── Step 1: Remove duplicate completed rework requests ───────────────────
-- Keep the OLDEST row (first requested) and discard duplicates.
DELETE FROM rework_requests
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY schedule_id, technician_id
             ORDER BY requested_at ASC, id ASC
           ) AS rn
    FROM rework_requests
    WHERE status = 'completed'
  ) ranked
  WHERE ranked.rn > 1
);

-- ─── Step 2: Remove duplicate open rework requests ────────────────────────
-- Keep the OLDEST open request (first requested) and discard any extras.
DELETE FROM rework_requests
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY schedule_id, technician_id
             ORDER BY requested_at ASC, id ASC
           ) AS rn
    FROM rework_requests
    WHERE status = 'open'
  ) ranked
  WHERE ranked.rn > 1
);

-- ─── Step 3: Add partial unique indexes ───────────────────────────────────
-- These guarantee that no technician can have more than one open rework,
-- and no more than one completed rework per schedule.
-- Partial indexes allow a technician to have BOTH an open and a completed
-- rework (which is the normal lifecycle: open → completed).
DROP INDEX IF EXISTS idx_rework_requests_unique_open;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rework_requests_unique_open
  ON rework_requests(schedule_id, technician_id)
  WHERE status = 'open';

DROP INDEX IF EXISTS idx_rework_requests_unique_completed;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rework_requests_unique_completed
  ON rework_requests(schedule_id, technician_id)
  WHERE status = 'completed';
