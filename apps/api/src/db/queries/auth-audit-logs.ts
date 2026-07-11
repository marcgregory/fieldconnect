/**
 * Auth audit log writer (Sprint 6, Phase 2).
 *
 * Stores events that don't fit the schedule-keyed `audit_logs` table (which has
 * `schedule_id NOT NULL`). Used for: verification_email_sent, verification_email_resent,
 * email_verified, verification_failed, login_blocked_unverified.
 *
 * The full event history is read-only from a future admin tool (Phase 8). For
 * now we only need to write. The query interface is intentionally simple — keep
 * it boring, keep it typed.
 */

import { query } from '../index';

export type AuthAuditAction =
  | 'verification_email_sent'
  | 'verification_email_resent'
  | 'email_verified'
  | 'verification_failed'
  | 'login_blocked_unverified';

/**
 * Write an auth audit event. `userId` may be null for events tied to unknown
 * emails (e.g. failed verification of a token whose owner we couldn't determine).
 */
export async function log(
  userId: string | null,
  action: AuthAuditAction,
  metadata?: Record<string, unknown>,
  ipAddress?: string,
): Promise<void> {
  await query(
    `INSERT INTO auth_audit_logs (user_id, action, metadata, ip_address)
     VALUES ($1, $2, $3, $4)`,
    [userId, action, metadata ? JSON.stringify(metadata) : null, ipAddress ?? null],
  );
}
