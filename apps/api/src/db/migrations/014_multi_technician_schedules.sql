-- Multi-technician schedules: replace single technician_id FK with a
-- many-to-many schedule_technicians junction table.
--
-- Migration strategy:
-- 1. Create schedule_technicians table
-- 2. Migrate existing technician_id rows into schedule_technicians
-- 3. Drop technician_id column from schedules
-- 4. Update status CHECK to match current model
-- 5. Recreate index

CREATE TABLE IF NOT EXISTS schedule_technicians (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(schedule_id, technician_id)
);

CREATE INDEX idx_sched_tech_schedule ON schedule_technicians(schedule_id);
CREATE INDEX idx_sched_tech_technician ON schedule_technicians(technician_id);

-- Migrate existing single-technician schedules
INSERT INTO schedule_technicians (schedule_id, technician_id)
  SELECT id, technician_id FROM schedules WHERE technician_id IS NOT NULL
  ON CONFLICT DO NOTHING;

-- Drop the old single-FK column
ALTER TABLE schedules DROP COLUMN technician_id;

-- Update the status CHECK constraint
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_status_check;
ALTER TABLE schedules ADD CONSTRAINT schedules_status_check
  CHECK (status IN ('scheduled','traveling','on_site','completed','closed'));
