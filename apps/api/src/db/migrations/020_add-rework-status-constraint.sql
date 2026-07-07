-- Add rework_required to the schedules status CHECK constraint
-- The constraint was last updated in migration 017/014/009

ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_status_check;
ALTER TABLE schedules ADD CONSTRAINT schedules_status_check
  CHECK (status IN ('scheduled','traveling','on_site','completed','closed','rework_required'));
