-- Add technician_id to evidence tables for per-technician ownership
-- on multi-technician schedules.

-- job_attachments
ALTER TABLE job_attachments ADD COLUMN technician_id UUID REFERENCES users(id);
CREATE INDEX idx_job_attachments_technician ON job_attachments(technician_id);

-- job_notes
ALTER TABLE job_notes ADD COLUMN technician_id UUID REFERENCES users(id);
CREATE INDEX idx_job_notes_technician ON job_notes(technician_id);

-- signatures
ALTER TABLE signatures ADD COLUMN technician_id UUID REFERENCES users(id);
CREATE INDEX idx_signatures_technician ON signatures(technician_id);

-- Backfill: for existing rows uploaded by field_technicians, set
-- technician_id = user_id (the uploader is the technician).
UPDATE job_attachments ja
  SET technician_id = ja.user_id
  FROM users u
  WHERE u.id = ja.user_id AND u.role = 'field_technician'
  AND ja.technician_id IS NULL;

UPDATE job_notes jn
  SET technician_id = jn.user_id
  FROM users u
  WHERE u.id = jn.user_id AND u.role = 'field_technician'
  AND jn.technician_id IS NULL;

UPDATE signatures s
  SET technician_id = s.user_id
  FROM users u
  WHERE u.id = s.user_id AND u.role = 'field_technician'
  AND s.technician_id IS NULL;
