-- Create signatures table for customer signature capture

CREATE TABLE signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  signature_data TEXT NOT NULL
    CHECK (signature_data LIKE 'data:image/png;base64,%'),
  label VARCHAR(100) DEFAULT 'customer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signatures_schedule ON signatures(schedule_id);
