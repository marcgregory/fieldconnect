-- Verification tokens for email verification (Sprint 6, Phase 2).
-- Tokens are SHA-256 hashed at rest. Single-active enforcement is in code so old
-- tokens remain auditable; only one active token per user at a time.

CREATE TABLE verification_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Token hash is the natural key — never store two rows for the same raw token.
CREATE UNIQUE INDEX idx_verification_tokens_hash ON verification_tokens(token_hash);
-- Fast lookup by user (resend, invalidate-all).
CREATE INDEX idx_verification_tokens_user ON verification_tokens(user_id);
-- Cleanup queries for expired tokens (Phase 8).
CREATE INDEX idx_verification_tokens_expires ON verification_tokens(expires_at);
