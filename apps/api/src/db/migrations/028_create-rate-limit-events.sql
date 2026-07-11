-- Rate-limit event store. Reused by Phase 2 (resend-verification) and Phase 4
-- (login attempt throttling, lockout).
--
-- Window design: scope_key + floor(now / windowSeconds) * windowSeconds.
-- Each request atomically increments count via INSERT ... ON CONFLICT.
-- Old rows are pruned by a periodic job (Phase 4) or a manual DELETE.

CREATE TABLE rate_limit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scope_key VARCHAR(255) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope_key, window_start)
);

CREATE INDEX idx_rate_limit_scope ON rate_limit_events(scope_key);
CREATE INDEX idx_rate_limit_window ON rate_limit_events(window_start);
