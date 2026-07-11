/**
 * Generic Postgres-backed rate limiter (Sprint 6, Phase 2 + Phase 4).
 *
 * Reused for: resend-verification (this phase), login attempts (Phase 4),
 * session events (Phase 5). Window semantics:
 *
 *   - Each (scope_key, window_start) is a single row.
 *   - window_start = floor(now_ms / window_seconds) * window_seconds.
 *   - Every call atomically increments count via ON CONFLICT DO UPDATE.
 *   - If count > max, the call is rejected but the count is still incremented
 *     (standard rate-limit pattern — over-limit attempts cost one row-write).
 *
 * No timer or scheduler is bundled; a periodic cleanup (Phase 4) prunes
 * expired windows.
 */

import { query } from '../index';

export interface RateLimitConfig {
  /** e.g. `'resend-verification:alice@x.com'`. Must be unique per policy. */
  scopeKey: string;
  /** Window length in seconds (60 = "per minute", 3600 = "per hour"). */
  windowSeconds: number;
  /** Maximum events allowed per window. Inclusive: count <= max ⇒ allowed. */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** How many events remain in this window after this call (0 if at max, -1 if over). */
  remaining: number;
  /** When the current window expires (clients can use this for a Retry-After header). */
  resetAt: Date;
  /** The count after this call. */
  count: number;
}

/**
 * Atomic check-and-increment. Returns whether the request is allowed under the
 * configured policy. Never throws on conflict — Postgres ON CONFLICT handles it.
 */
export async function check(config: RateLimitConfig): Promise<RateLimitResult> {
  const nowMs = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(nowMs / windowMs) * windowMs);
  const resetAt = new Date(windowStart.getTime() + windowMs);

  // Insert a fresh row, or increment the existing one for this window.
  const result = await query(
    `INSERT INTO rate_limit_events (scope_key, window_start, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (scope_key, window_start)
     DO UPDATE SET count = rate_limit_events.count + 1
     RETURNING count`,
    [config.scopeKey, windowStart.toISOString()],
  );

  const count = Number(result.rows[0].count);
  const allowed = count <= config.max;
  const remaining = Math.max(0, config.max - count);

  return { allowed, remaining, resetAt, count };
}
