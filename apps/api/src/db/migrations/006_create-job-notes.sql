-- Create job_notes table for technician and internal job notes

CREATE TABLE job_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  note_type VARCHAR(20) NOT NULL DEFAULT 'technician'
    CHECK (note_type IN ('technician', 'internal')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_notes_schedule ON job_notes(schedule_id);
CREATE INDEX idx_job_notes_type ON job_notes(note_type);
