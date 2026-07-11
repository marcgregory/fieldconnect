/**
 * Login attempt tracking (Sprint 6, Phase 4 — Login Protection).
 *
 * Manages two independent throttles:
 *
 *   1. Per-IP rate limit via the existing `rate_limit_events` table (fixed
 *      window, 10 attempts per 5 minutes per client IP).
 *   2. Per-account lockout via the new `login_lockouts` table (triggered
 *      after 5 consecutive failures, auto-unlocks after 15 minutes or on
 *      successful login).
 *
 * The per-IP limit prevents bulk guessing from a single origin. The per-account
 * lockout prevents targeted brute-force against one email. They are independent:
 * an IP that exceeds the rate limit is blocked regardless of which email the
 * request targets, and a locked account is blocked regardless of the origin IP.
 */

import { query } from '../index';
import * as rateLimit from './rate-limit';
import type { RateLimitResult } from './rate-limit';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;
const IP_WINDOW_SECONDS = 300; // 5 min
const IP_MAX_ATTEMPTS = 10;

/**
 * Normalize a client IP for use as a scope key.
 * Strips the IPv6-mapped-IPv4 prefix (`::ffff:`) so the same client reaching us
 * over IPv4 and IPv6 gets the same scope key.
 */
function normalizeIp(ip: string): string {
  return ip.replace(/^::ffff:/, '');
}

// ─── Per-IP rate limit (reuses rate_limit_events) ──────────────────────────

export interface IpLimitResult extends RateLimitResult {}

/**
 * Check and optionally increment the per-IP rate limit. Call with `increment =
 * false` before processing the body (read-only pre-check), then `increment =
 * true` after a failed attempt to charge the throttle.
 */
export async function checkIpLimit(
  ip: string,
  increment = true,
): Promise<IpLimitResult> {
  return rateLimit.check({
    scopeKey: `login-ip:${normalizeIp(ip)}`,
    windowSeconds: IP_WINDOW_SECONDS,
    max: IP_MAX_ATTEMPTS,
  });
}

// ─── Per-account lockout (new login_lockouts table) ───────────────────────

export interface LockoutCheckResult {
  locked: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  remainingSeconds: number;
}

/**
 * Check whether an email is currently locked out. Returns the lockout state
 * without side effects. Cleans up stale (expired) rows inline.
 */
export async function checkLockout(email: string): Promise<LockoutCheckResult> {
  // Clean up expired rows first so a stale lockout doesn't persist.
  await clearExpiredLockouts();

  const result = await query(
    `SELECT failed_attempts, locked_until
       FROM login_lockouts
      WHERE email = $1`,
    [email.toLowerCase()],
  );

  const row = result.rows[0] as
    | { failed_attempts: number; locked_until: string | null }
    | undefined;

  if (!row) {
    return { locked: false, failedAttempts: 0, lockedUntil: null, remainingSeconds: 0 };
  }

  const locked = row.locked_until !== null;
  const remainingSeconds = locked
    ? Math.max(0, Math.ceil((new Date(row.locked_until!).getTime() - Date.now()) / 1000))
    : 0;

  return {
    locked,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
    remainingSeconds,
  };
}

export interface RecordFailureOptions {
  email: string;
  ip: string;
}

export type RecordFailureResult =
  | { action: 'failure_counted'; failedAttempts: number }
  | {
      action: 'account_locked';
      failedAttempts: number;
      lockedUntil: string;
      remainingSeconds: number;
    };

/**
 * Record a failed login attempt:
 *   UPSERT the login_lockouts row (increment failed_attempts; if >= 5, set
 *   locked_until = NOW() + 15 min).
 *
 * The per-IP rate-limit counter was already charged in the login handler
 * (checkIpLimit at the top), so this function only updates the per-account
 * lockout. The rate limit re-use of the existing scope key means the top-level
 * check does double duty: reserving a slot AND detecting over-limit state.
 */
export async function recordFailure(
  opts: RecordFailureOptions,
): Promise<RecordFailureResult> {
  const { email, ip } = opts;
  const normalizedEmail = email.toLowerCase();

  // NOTE: The per-IP rate-limit counter was already charged in the login
  // handler (checkIpLimit at the top), so we do NOT increment it again here.
  // Only the per-account lockout is updated.

  // UPSERT login_lockouts
  const result = await query(
    `INSERT INTO login_lockouts (email, failed_attempts, locked_until)
     VALUES ($1, 1, NULL)
     ON CONFLICT (email)
     DO UPDATE SET
       failed_attempts = login_lockouts.failed_attempts + 1,
       locked_until = CASE
         WHEN login_lockouts.failed_attempts + 1 >= $2
         THEN NOW() + ($3 || ' minutes')::INTERVAL
         ELSE NULL
       END
     RETURNING failed_attempts, locked_until`,
    [normalizedEmail, LOCKOUT_THRESHOLD, LOCKOUT_MINUTES],
  );

  const row = result.rows[0] as {
    failed_attempts: number;
    locked_until: string | null;
  };

  const failedAttempts = row.failed_attempts;

  if (row.locked_until) {
    const remainingSeconds = Math.max(
      0,
      Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 1000),
    );
    return {
      action: 'account_locked',
      failedAttempts,
      lockedUntil: row.locked_until,
      remainingSeconds,
    };
  }

  return { action: 'failure_counted', failedAttempts };
}

/**
 * Record a successful login — deletes the lockout row so failure state is
 * completely cleared for this email.
 */
export async function recordSuccess(email: string): Promise<void> {
  await query(`DELETE FROM login_lockouts WHERE email = $1`, [email.toLowerCase()]);
}

/**
 * Remove lockout rows whose lockout has expired and the lockout duration has
 * fully passed. Called inline on every lockout check, so stale rows don't
 * accumulate between cleanup runs.
 */
export async function clearExpiredLockouts(): Promise<number> {
  const result = await query(
    `DELETE FROM login_lockouts
      WHERE locked_until IS NOT NULL
        AND locked_until < NOW()
        AND locked_until < NOW() - INTERVAL '1 hour'`,
  );
  return result.rowCount ?? 0;
}
