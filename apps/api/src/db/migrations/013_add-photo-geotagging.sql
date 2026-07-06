-- Add GPS geotagging and image dimension fields to job_attachments
-- Part of Phase C — Photo Geotagging evidence system

ALTER TABLE job_attachments
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS accuracy DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS distance_from_site INTEGER,
  ADD COLUMN IF NOT EXISTS inside_geofence BOOLEAN,
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER,
  ADD COLUMN IF NOT EXISTS format VARCHAR(10);
