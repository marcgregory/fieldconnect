-- Password reset tokens (Sprint 6, Phase 3).
-- Mirrors verification_tokens structurally: SHA-256 hash at rest, single-active
-- enforced in code (invalidate prior tokens before creating a new one), 1h TTL.
-- On consume, the route also revokes all refresh tokens for the user (handled
-- in the application layer, not in the DB).
--
-- Keeping this as a separate table (not a generic "tokens" table) so each token
-- type has its own schema, TTL, and audit semantics. The naming makes the query
-- modules self-documenting.

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique on hash: guarantee no two rows share the same token hash.
CREATE UNIQUE INDEX idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
-- Fast lookup by user (for invalidate-all on re-request).
CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);
-- Cleanup queries for expired tokens (future maintenance job).
CREATE INDEX idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);
