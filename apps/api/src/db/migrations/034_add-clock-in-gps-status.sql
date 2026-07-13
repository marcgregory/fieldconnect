-- Add clock_in_gps_status and clock_in_gps_error to time_entries
--
-- Previously, there was no stored distinction between:
--   - permission_denied, timeout, position_unavailable, unsupported, omitted, captured
-- The review UI could only show "no GPS data" without saying why.
--
-- clock_in_gps_status  — the exact failure reason from the browser geolocation API
-- clock_in_gps_error   — safe error text (no PII) for display in the review UI

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS clock_in_gps_status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS clock_in_gps_error VARCHAR(500);
