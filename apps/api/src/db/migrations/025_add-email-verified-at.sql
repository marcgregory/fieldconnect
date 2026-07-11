-- Add email_verified_at column to users.
-- Forward-compatible with future change-email flow (Phase 2.5 / Sprint 7):
-- the column flips back to NULL on email change, then to a timestamp on re-verification.

ALTER TABLE users
  ADD COLUMN email_verified_at TIMESTAMPTZ NULL;
