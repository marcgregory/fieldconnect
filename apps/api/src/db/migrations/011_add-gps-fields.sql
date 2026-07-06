-- Add GPS fields to time_entries and projects

ALTER TABLE time_entries
  ADD COLUMN clock_in_lat DOUBLE PRECISION,
  ADD COLUMN clock_in_lng DOUBLE PRECISION,
  ADD COLUMN clock_out_lat DOUBLE PRECISION,
  ADD COLUMN clock_out_lng DOUBLE PRECISION;

ALTER TABLE projects
  ADD COLUMN latitude DOUBLE PRECISION,
  ADD COLUMN longitude DOUBLE PRECISION,
  ADD COLUMN geofence_radius INTEGER NOT NULL DEFAULT 50;
