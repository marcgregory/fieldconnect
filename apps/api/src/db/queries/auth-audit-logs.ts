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
  | 'login_blocked_unverified'
  // Phase 3 — Password Reset
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'password_reset_failed'
  | 'password_changed_notification_sent'
  // Phase 4 — Login Protection
  | 'login_failed'
  | 'login_rate_limited'
  | 'account_temporarily_locked'
  | 'login_blocked_locked'
  | 'login_success'
  | 'lockout_cleared'
  // Phase 5 — Session Security
  | 'session_created'
  | 'token_refreshed'
  | 'refresh_token_reuse_detected'
  | 'session_revoked'
  | 'logout'
  | 'logout_all'
  | 'all_sessions_revoked';

export interface AuthAuditEvent {
  id: string;
  user_id: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
}

export interface ListAuthAuditOptions {
  limit: number;
  offset: number;
  userId?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ListAuthAuditResult {
  events: AuthAuditEvent[];
  total: number;
}

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

/**
 * List auth audit events with optional filtering and user name join.
 */
export async function list(opts: ListAuthAuditOptions): Promise<ListAuthAuditResult> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (opts.userId) {
    conditions.push(`aal.user_id = $${paramIdx++}`);
    params.push(opts.userId);
  }
  if (opts.action) {
    conditions.push(`aal.action = $${paramIdx++}`);
    params.push(opts.action);
  }
  if (opts.dateFrom) {
    conditions.push(`aal.created_at >= $${paramIdx++}`);
    params.push(opts.dateFrom);
  }
  if (opts.dateTo) {
    conditions.push(`aal.created_at <= $${paramIdx++}`);
    params.push(opts.dateTo);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Total count
  const countResult = await query(
    `SELECT COUNT(*) AS cnt FROM auth_audit_logs aal ${where}`,
    params,
  );
  const total = parseInt(countResult.rows[0].cnt, 10);

  // Paginated results
  const limit = Math.min(Math.max(1, opts.limit), 200);
  const offset = Math.max(0, opts.offset);

  const dataResult = await query(
    `SELECT
       aal.id,
       aal.user_id,
       aal.action,
       aal.metadata,
       aal.ip_address,
       aal.created_at,
       u.name AS user_name,
       u.email AS user_email
     FROM auth_audit_logs aal
     LEFT JOIN users u ON u.id = aal.user_id
     ${where}
     ORDER BY aal.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset],
  );

  return {
    events: dataResult.rows as AuthAuditEvent[],
    total,
  };
}

/**
 * Get the distinct set of auth audit actions (for filter dropdown).
 */
export async function listActions(): Promise<string[]> {
  const result = await query(
    `SELECT DISTINCT action FROM auth_audit_logs ORDER BY action`,
  );
  return result.rows.map((r: { action: string }) => r.action);
}

/**
 * Get a summary of event counts by action for a given time period.
 */
export async function getSummary(
  sinceHours: number = 24,
): Promise<{ action: string; count: number }[]> {
  const result = await query(
    `SELECT action, COUNT(*) AS count
       FROM auth_audit_logs
      WHERE created_at >= NOW() - ($1 || ' hours')::INTERVAL
      GROUP BY action
      ORDER BY count DESC`,
    [sinceHours],
  );
  return result.rows.map((r: { action: string; count: string }) => ({
    action: r.action,
    count: parseInt(r.count, 10),
  }));
}
