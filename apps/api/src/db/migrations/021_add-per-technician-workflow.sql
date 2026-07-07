-- Per-technician workflow columns for schedule_technicians
--
-- Each technician assigned to a schedule now has their own workflow state,
-- enabling independent status tracking, completion, closing, and rework.
--
-- schedule_technicians.status is the authoritative workflow state.
-- schedules.status is a derived summary (updated by the backend on each
-- technician transition, not written directly by business logic).
--
-- Columns added:
--   status                 — per-technician job status
--   completed_at           — when this technician completed their work
--   closed_at              — when this technician's work was reviewed/closed
--   current_rework_version — rework version specific to this technician (0 = original)
--   has_open_rework        — whether this technician has an unresolved rework request

ALTER TABLE schedule_technicians
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_rework_version INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_open_rework BOOLEAN NOT NULL DEFAULT FALSE;

-- Add CHECK constraint for status (same valid values as schedules)
ALTER TABLE schedule_technicians DROP CONSTRAINT IF EXISTS schedule_technicians_status_check;
ALTER TABLE schedule_technicians ADD CONSTRAINT schedule_technicians_status_check
  CHECK (status IN ('scheduled','traveling','on_site','completed','closed','rework_required'));

-- Add updated_at for tracking per-tech status change timestamps
ALTER TABLE schedule_technicians ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Index for per-technician status queries (review queue, my-jobs, etc.)
CREATE INDEX IF NOT EXISTS idx_sched_tech_status
  ON schedule_technicians(schedule_id, technician_id, status);

-- ════════════════════════════════════════════════════════════════════════
-- Backfill (one-time migration only)
-- ════════════════════════════════════════════════════════════════════════

-- Historical backfill only.
-- Future writes must populate completed_at/closed_at from workflow transitions.

-- 1. Copy schedules.status into each schedule_technicians row.
--    schedules.updated_at is a reasonable proxy for old data but future
--    writes must set completed_at/closed_at from the exact transition.
UPDATE schedule_technicians st
SET
  status = s.status,
  completed_at = CASE
    WHEN s.status IN ('completed', 'closed', 'rework_required') THEN s.updated_at
    ELSE NULL
  END,
  closed_at = CASE
    WHEN s.status = 'closed' THEN s.updated_at
    ELSE NULL
  END
FROM schedules s
WHERE st.schedule_id = s.id
  AND s.status != 'scheduled';

-- 2. Mark technicians with open rework requests
UPDATE schedule_technicians st
SET has_open_rework = TRUE
FROM rework_requests rr
WHERE rr.schedule_id = st.schedule_id
  AND rr.status = 'open';

-- 3. Set current_rework_version from completed rework cycles
UPDATE schedule_technicians st
SET current_rework_version = (
  SELECT COUNT(*)::int
  FROM rework_requests rr
  WHERE rr.schedule_id = st.schedule_id
    AND rr.status = 'completed'
);
