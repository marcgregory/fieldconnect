-- Auth audit log. Separate from audit_logs (which is schedule-keyed and has
-- schedule_id NOT NULL with a FK to schedules). This table accepts auth-only
-- events: verification_email_sent, verification_email_resent, email_verified,
-- verification_failed, login_blocked_unverified.
--
-- Phase 8 (Audit & Monitoring) will likely read both tables for a unified view.

CREATE TABLE auth_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- SET NULL on user delete so audit history survives.
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  metadata JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_audit_user ON auth_audit_logs(user_id);
CREATE INDEX idx_auth_audit_action ON auth_audit_logs(action);
CREATE INDEX idx_auth_audit_created ON auth_audit_logs(created_at);
