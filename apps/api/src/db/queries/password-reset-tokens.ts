/**
 * Password reset tokens (Sprint 6, Phase 3).
 *
 * Mirrors verification-tokens.ts structurally:
 * - SHA-256 hashed at rest (raw token only in the email URL)
 * - Single-active enforcement in code (resend supersedes prior tokens via
 *   `used_at = NOW()` so they cannot be consumed)
 * - 1-hour TTL (as opposed to verification tokens' 24h)
 *
 * New method not present in verification-tokens: `peek()`. Returns the same
 * `ConsumeResult` shape as `consume()` but without implying a transactional
 * write. The `reset-password/[token]` page calls `peek` on mount to decide
 * whether to show the form or the "link expired" screen.
 */

import { query } from '../index';
import { randomUUID, createHash } from 'crypto';

const TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateToken(): string {
  return randomUUID() + '-' + randomUUID();
}

export interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

/**
 * Create a new password reset token for a user. Returns the raw token (the
 * caller must hand it to the email service — never store it).
 *
 * The caller must invalidate prior active tokens first (single-active rule).
 */
export async function create(userId: string): Promise<string> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );

  return token;
}

/**
 * Mark all currently active (un-used, un-expired) tokens for this user as
 * superseded. Called before issuing a new token — rows stay for the audit
 * trail and return `{ ok: false, reason: 'used' }` if replayed.
 */
export async function invalidateAllForUser(userId: string): Promise<void> {
  await query(
    `UPDATE password_reset_tokens
       SET used_at = NOW()
     WHERE user_id = $1
       AND used_at IS NULL
       AND expires_at > NOW()`,
    [userId],
  );
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' };

/**
 * Look up a token by its hash and report its status. Does NOT mark it used.
 * This is the "peek" method — read-only, for the reset-password result page
 * on initial paint.
 */
export async function peek(token: string): Promise<ConsumeResult> {
  const tokenHash = hashToken(token);

  const result = await query(
    `SELECT user_id, expires_at, used_at
       FROM password_reset_tokens
      WHERE token_hash = $1`,
    [tokenHash],
  );

  const row = result.rows[0];
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.used_at) return { ok: false, reason: 'used' };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, userId: row.user_id as string };
}

/**
 * Alias for `peek`. The name distinction makes the intent obvious at call
 * sites: `consume` is paired with `markUsed` for the transactional write;
 * `peek` is called alone for the read-only page-load path.
 */
export const consume = peek;

/**
 * Mark a token as used. Called inside the user-update transaction in the
 * reset-password route.
 */
export async function markUsed(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await query(
    `UPDATE password_reset_tokens
       SET used_at = NOW()
     WHERE token_hash = $1`,
    [tokenHash],
  );
}
