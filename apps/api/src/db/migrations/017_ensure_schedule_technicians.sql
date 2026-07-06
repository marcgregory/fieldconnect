-- Restorative migration: ensure schedule_technicians junction table exists.
--
-- Prior migration 014_multi_technician_schedules.sql was designed to create this
-- table and migrate single-technician data, but never applied to the production
-- database (the .env file overrides Render's DATABASE_URL at migrate time).
--
-- This file is idempotent: safe to run on a database where 014 already ran
-- (or partially ran), or where technician_id still exists on schedules.

-- 1. Create the junction table if it doesn't exist
CREATE TABLE IF NOT EXISTS schedule_technicians (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(schedule_id, technician_id)
);

CREATE INDEX IF NOT EXISTS idx_sched_tech_schedule ON schedule_technicians(schedule_id);
CREATE INDEX IF NOT EXISTS idx_sched_tech_technician ON schedule_technicians(technician_id);

-- 2. Migrate existing single-technician data if technician_id column still exists
--    (won't be the case if 014 already applied — the DO block handles it gracefully)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schedules' AND column_name = 'technician_id'
  ) THEN
    INSERT INTO schedule_technicians (schedule_id, technician_id)
      SELECT id, technician_id FROM schedules
      WHERE technician_id IS NOT NULL
      ON CONFLICT DO NOTHING;

    ALTER TABLE schedules DROP COLUMN technician_id;
  END IF;
END $$;

-- 3. Ensure the status CHECK constraint is up to date
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_status_check;
ALTER TABLE schedules ADD CONSTRAINT schedules_status_check
  CHECK (status IN ('scheduled','traveling','on_site','completed','closed'));
