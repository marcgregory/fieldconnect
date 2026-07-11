-- Login lockout tracking for Sprint 6, Phase 4 (Login Protection).
--
-- Stores consecutive failure counts and lockout state per-email. Keyed by
-- email (lowercased) as the natural primary key — one row per email, updated
-- atomically via UPSERT. On successful login, the row is deleted. On lockout
-- expiration, the row is automatically ignored by the check query (and cleaned
-- up periodically or inline).
--
-- Separated from rate_limit_events because lockout has a triggered start time
-- (the moment the 5th failure occurs) rather than a fixed window — the
-- rate_limit_events fixed-window model doesn't fit lockout semantics.

CREATE TABLE login_lockouts (
  email TEXT PRIMARY KEY,
  failed_attempts INT NOT NULL DEFAULT 1,
  locked_until TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index for quick cleanup of expired lockout rows.
CREATE INDEX idx_login_lockouts_locked_until ON login_lockouts(locked_until)
  WHERE locked_until IS NOT NULL;
