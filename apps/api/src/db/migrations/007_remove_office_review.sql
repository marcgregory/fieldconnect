-- Remove office_review from the status workflow
-- Simplified: scheduled → traveling → on_site → completed → closed

-- 1. Convert existing office_review records to completed
UPDATE schedules SET status = 'completed', updated_at = NOW() WHERE status = 'office_review';

-- 2. Add a new, stricter CHECK constraint and drop the old one
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_status_check;
ALTER TABLE schedules ADD CONSTRAINT schedules_status_check
  CHECK (status IN ('scheduled','traveling','on_site','completed','closed'));
