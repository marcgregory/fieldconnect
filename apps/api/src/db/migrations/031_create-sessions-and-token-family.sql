-- Sprint 6, Phase 5 — Session Security & Token Family
--
-- 1. Add token_family_id to refresh_tokens so rotated tokens are grouped into
--    a "family" rooted at the same login session. When a reused (already
--    rotated) token is presented, the entire family is revoked.
-- 2. Create a sessions table that the user sees in the UI — each session maps
--    to one device/browser login.

-- ── Add family columns to refresh_tokens ────────────────────────────────────

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS token_family_id UUID;

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS family_revoked_at TIMESTAMPTZ;

-- Backfill token_family_id for existing rows that lack one. Use the row's own
-- id as the family seed so every pre-migration token becomes its own family.
UPDATE refresh_tokens
   SET token_family_id = id
 WHERE token_family_id IS NULL;

-- Now make it NOT NULL going forward.
ALTER TABLE refresh_tokens
  ALTER COLUMN token_family_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family
  ON refresh_tokens(token_family_id);

-- ── Sessions table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       VARCHAR(255),             -- optional user-given label
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  ip_address  VARCHAR(45),
  user_agent  VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user   ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
