-- Add GPS accuracy fields to time_entries

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS clock_in_accuracy DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS clock_out_accuracy DOUBLE PRECISION;
