-- Create activity_events table for persistent Live Feed history.
-- Every WebSocket event should also insert a row here so the feed
-- survives page refresh / navigation.
--
-- id:        stable UUID used by the frontend for deduplication
-- event_type: kebab-case event name (e.g. clock_in, note_added, photo_uploaded)
-- message:   pre-formatted human-readable message for the feed
-- metadata:  raw event payload (for extensibility / re-processing)
-- actor_id:  user who performed the action

CREATE TABLE activity_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(50) NOT NULL,
  schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  technician_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_events_created ON activity_events(created_at DESC);
CREATE INDEX idx_activity_events_type ON activity_events(event_type);
CREATE INDEX idx_activity_events_schedule ON activity_events(schedule_id);
CREATE INDEX idx_activity_events_actor ON activity_events(actor_id);
