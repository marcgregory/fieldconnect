import { query } from '../index';
import { randomUUID, createHash } from 'crypto';

/** Hash a refresh token for secure storage */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Generate a cryptographically random refresh token */
export function generateToken(): string {
  return randomUUID() + '-' + randomUUID();
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  device_info: string | null;
  ip_address: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

/**
 * Store a new refresh token for a user.
 * Returns the token string (the caller must return this to the client).
 */
export async function create(
  userId: string,
  deviceInfo?: string,
  ipAddress?: string,
  ttlDays = 30,
): Promise<string> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, deviceInfo ?? null, ipAddress ?? null, expiresAt],
  );

  return token;
}

/**
 * Validate a refresh token and return the associated user_id.
 * Returns null if the token is invalid, expired, or revoked.
 */
export async function validate(token: string): Promise<string | null> {
  const tokenHash = hashToken(token);

  const result = await query(
    `SELECT user_id FROM refresh_tokens
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash],
  );

  return result.rows[0]?.user_id || null;
}

/**
 * Revoke a refresh token (e.g., on logout).
 */
export async function revoke(token: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const result = await query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Revoke all refresh tokens for a user (e.g., password change).
 */
export async function revokeAllForUser(userId: string): Promise<void> {
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}

/**
 * Clean up expired refresh tokens (call periodically).
 */
export async function cleanupExpired(): Promise<number> {
  const result = await query(
    `DELETE FROM refresh_tokens WHERE expires_at < NOW()`,
  );
  return result.rowCount ?? 0;
}
