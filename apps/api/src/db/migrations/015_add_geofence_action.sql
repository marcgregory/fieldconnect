-- Phase D: Configurable Geofence Enforcement
-- Add geofence action/behavior field to projects

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS geofence_action VARCHAR(20) NOT NULL DEFAULT 'warning'
    CHECK (geofence_action IN ('warning', 'block_clock_in', 'require_override'));
