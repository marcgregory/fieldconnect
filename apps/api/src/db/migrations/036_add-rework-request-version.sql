-- Add an explicit per-technician rework version to rework requests and repair
-- evidence rows that were written with the next version twice.

ALTER TABLE rework_requests
  ADD COLUMN IF NOT EXISTS rework_version INT;

WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY schedule_id, technician_id
      ORDER BY requested_at ASC, id ASC
    )::int AS version
  FROM rework_requests
)
UPDATE rework_requests rr
SET rework_version = numbered.version
FROM numbered
WHERE rr.id = numbered.id
  AND (rr.rework_version IS NULL OR rr.rework_version <> numbered.version);

ALTER TABLE rework_requests
  ALTER COLUMN rework_version SET DEFAULT 1,
  ALTER COLUMN rework_version SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rework_requests_unique_version
  ON rework_requests(schedule_id, technician_id, rework_version);

UPDATE schedule_technicians st
SET
  current_rework_version = COALESCE(versions.max_version, 0),
  has_open_rework = COALESCE(versions.has_open, FALSE)
FROM (
  SELECT
    schedule_id,
    technician_id,
    MAX(rework_version)::int AS max_version,
    BOOL_OR(status = 'open') AS has_open
  FROM rework_requests
  GROUP BY schedule_id, technician_id
) versions
WHERE st.schedule_id = versions.schedule_id
  AND st.technician_id = versions.technician_id;

UPDATE job_notes jn
SET rework_version = versions.max_version
FROM (
  SELECT schedule_id, technician_id, MAX(rework_version)::int AS max_version
  FROM rework_requests
  GROUP BY schedule_id, technician_id
) versions
WHERE jn.rework_version > versions.max_version
  AND jn.rework_version > 0
  AND jn.schedule_id = versions.schedule_id
  AND jn.technician_id = versions.technician_id;

UPDATE job_attachments ja
SET rework_version = versions.max_version
FROM (
  SELECT schedule_id, technician_id, MAX(rework_version)::int AS max_version
  FROM rework_requests
  GROUP BY schedule_id, technician_id
) versions
WHERE ja.rework_version > versions.max_version
  AND ja.rework_version > 0
  AND ja.schedule_id = versions.schedule_id
  AND ja.technician_id = versions.technician_id;

UPDATE signatures sig
SET rework_version = versions.max_version
FROM (
  SELECT schedule_id, technician_id, MAX(rework_version)::int AS max_version
  FROM rework_requests
  GROUP BY schedule_id, technician_id
) versions
WHERE sig.rework_version > versions.max_version
  AND sig.rework_version > 0
  AND sig.schedule_id = versions.schedule_id
  AND sig.technician_id = versions.technician_id;
