-- Add rework_version columns to evidence tables
-- version 0 = original submission, 1+ = rework cycles

ALTER TABLE job_notes ADD COLUMN rework_version INT NOT NULL DEFAULT 0;
ALTER TABLE job_attachments ADD COLUMN rework_version INT NOT NULL DEFAULT 0;
ALTER TABLE signatures ADD COLUMN rework_version INT NOT NULL DEFAULT 0;

CREATE INDEX idx_job_notes_rework ON job_notes(schedule_id, rework_version);
CREATE INDEX idx_job_attachments_rework ON job_attachments(schedule_id, rework_version);
CREATE INDEX idx_signatures_rework ON signatures(schedule_id, rework_version);
