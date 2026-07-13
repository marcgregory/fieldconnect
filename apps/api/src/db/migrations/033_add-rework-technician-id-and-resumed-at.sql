-- Add technician_id and resumed_at to rework_requests for per-technician rework tracking
--
-- Previously, rework_requests were scoped only to schedule_id without identifying
-- which technician the rework was for. This made per-technician rework history
-- impossible to render correctly in the review queue.
--
-- Added:
--   technician_id  — which technician this rework request is for
--   resumed_at     — when the technician started working on the rework

ALTER TABLE rework_requests
  ADD COLUMN IF NOT EXISTS technician_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS resumed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rework_requests_technician
  ON rework_requests(technician_id);

-- Backfill: for existing rework requests without a technician_id, try to
-- determine the correct technician from schedule_technicians.
-- We match on schedule_id + has_open_rework for open requests, and on the
-- schedule_technicians.technician_id for completed requests (using the first
-- assigned technician as a fallback since old data doesn't have per-tech records).
WITH backfill AS (
  SELECT
    rr.id AS rework_id,
    st.technician_id AS inferred_tech_id
  FROM rework_requests rr
  LEFT JOIN schedule_technicians st ON st.schedule_id = rr.schedule_id
  WHERE rr.technician_id IS NULL
    AND (
      (rr.status = 'open' AND st.has_open_rework = TRUE)
      OR
      (rr.status = 'completed')
    )
)
UPDATE rework_requests rr
SET technician_id = backfill.inferred_tech_id
FROM backfill
WHERE rr.id = backfill.rework_id;

-- If any rework still has no technician_id (edge case), assign the first
-- technician from the schedule as a last resort
UPDATE rework_requests rr
SET technician_id = (
  SELECT technician_id FROM schedule_technicians
  WHERE schedule_id = rr.schedule_id
  ORDER BY technician_id
  LIMIT 1
)
WHERE technician_id IS NULL;
