/**
 * Verification tokens (Sprint 6, Phase 2 — email verification).
 *
 * - Tokens are SHA-256 hashed at rest (raw token only ever held in the email URL).
 * - Single-active enforcement is in code: resend supersedes prior active tokens by
 *   setting `used_at = NOW()` so they cannot be consumed. We keep the rows around
 *   for audit (they will return `reason: 'used'` if replayed).
 * - TTL is 24h from issue. Expired tokens cannot be consumed; the user must resend.
 *
 * The pattern intentionally mirrors `refresh-tokens.ts` so future readers see one
 * consistent token-handling story.
 */

import { query } from '../index';
import { randomUUID, createHash } from 'crypto';

const TTL_HOURS = 24;

/** Hash a token for secure storage. SHA-256 is sufficient for high-entropy random tokens. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Generate a cryptographically random verification token. */
export function generateToken(): string {
  return randomUUID() + '-' + randomUUID();
}

export interface VerificationTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

/**
 * Create a new verification token for a user. Returns the raw token (the caller
 * must hand it to the email service — never store it).
 *
 * Caller is responsible for invalidating prior active tokens first if single-active
 * semantics are desired. We do that automatically in `invalidateAllForUser`.
 */
export async function create(userId: string): Promise<string> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000).toISOString();

  await query(
    `INSERT INTO verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );

  return token;
}

/**
 * Mark all of this user's currently active (un-used, un-expired) tokens as
 * superseded. Called before issuing a new token so only one is usable at a time.
 * The rows are not deleted — the audit trail stays intact.
 */
export async function invalidateAllForUser(userId: string): Promise<void> {
  await query(
    `UPDATE verification_tokens
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
 * Look up a token by its hash and report its status. Does NOT mark it used —
 * the caller does that as part of the same user-update transaction (see
 * `routes/auth/verification.ts`). Splitting the read from the write lets us
 * return a precise failure reason to the UI.
 */
export async function consume(token: string): Promise<ConsumeResult> {
  const tokenHash = hashToken(token);

  const result = await query(
    `SELECT user_id, expires_at, used_at
       FROM verification_tokens
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
 * Mark a token as used. Called inside the user-update transaction in the
 * verification route. Pass the raw token — we hash it for the UPDATE.
 */
export async function markUsed(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await query(
    `UPDATE verification_tokens
       SET used_at = NOW()
     WHERE token_hash = $1`,
    [tokenHash],
  );
}
