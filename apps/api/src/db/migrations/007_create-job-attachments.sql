-- Create job_attachments table for photos and documents

CREATE TABLE job_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  attachment_type VARCHAR(20) NOT NULL DEFAULT 'document'
    CHECK (attachment_type IN ('before', 'during', 'after', 'document')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_attachments_schedule ON job_attachments(schedule_id);
CREATE INDEX idx_job_attachments_type ON job_attachments(attachment_type);
