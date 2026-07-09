-- Add retention column to activity_events for Live Feed / Audit Log separation.
--
-- Values:
--   feed  = shown in Live Feed, eligible for TTL cleanup (default)
--   audit = permanent audit-only, never shown in Live Feed
--   both  = shown in Live Feed AND preserved permanently
--
-- Cleanup (to be run via cron when needed):
--   DELETE FROM activity_events
--   WHERE retention = 'feed'
--   AND created_at < NOW() - INTERVAL '7 days';

ALTER TABLE activity_events
  ADD COLUMN retention VARCHAR(20) NOT NULL DEFAULT 'feed';

-- Constrain to allowed values
ALTER TABLE activity_events
  ADD CONSTRAINT chk_activity_retention
  CHECK (retention IN ('feed', 'audit', 'both'));

-- Composite index so Live Feed query can filter by retention + sort by time
CREATE INDEX idx_activity_events_retention_created_at
  ON activity_events (retention, created_at DESC);

-- The old index is now redundant for the feed query but keep it for
-- other lookups (e.g. admin browsing all events of a given type).
