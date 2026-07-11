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
  token_family_id: string;
  device_info: string | null;
  ip_address: string | null;
  expires_at: string;
  revoked_at: string | null;
  family_revoked_at: string | null;
  created_at: string;
}

export interface ValidateResult {
  userId: string;
  tokenId: string;
  familyId: string;
  familyRevoked: boolean;
}

/**
 * Store a new refresh token as the start of a token family (session).
 * Returns the token string (the caller must return this to the client).
 */
export async function create(
  userId: string,
  sessionId: string,
  deviceInfo?: string,
  ipAddress?: string,
  ttlDays = 30,
): Promise<string> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, token_family_id, device_info, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, tokenHash, sessionId, deviceInfo ?? null, ipAddress ?? null, expiresAt],
  );

  return token;
}

/**
 * Rotate to a new token within the same family.
 * Returns the new token, the family (session) id, and the user id.
 * Returns null if the token is invalid, expired, already revoked,
 * or the family was revoked (reuse detected earlier).
 */
export async function rotate(
  oldToken: string,
  deviceInfo?: string,
  ipAddress?: string,
  ttlDays = 30,
): Promise<{ newToken: string; userId: string; familyId: string } | null> {
  const oldHash = hashToken(oldToken);

  // Read the existing token — must be valid, not revoked, family not revoked.
  const result = await query(
    `SELECT id, user_id, token_family_id, family_revoked_at FROM refresh_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
    [oldHash],
  );

  const row = result.rows[0] as
    | { id: string; user_id: string; token_family_id: string; family_revoked_at: string | null }
    | undefined;

  if (!row) return null;
  if (row.family_revoked_at) return null;

  // Revoke this specific token.
  await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.id]);

  // Issue new token in the same family.
  const newToken = generateToken();
  const newHash = hashToken(newToken);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, token_family_id, device_info, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.user_id, newHash, row.token_family_id, deviceInfo ?? null, ipAddress ?? null, expiresAt],
  );

  return { newToken, userId: row.user_id, familyId: row.token_family_id };
}

/**
 * Detect reuse: a previously-rotated token has been presented again.
 * Revokes the entire token family and returns true if action was taken.
 */
export async function detectReuse(oldToken: string): Promise<string | null> {
  const oldHash = hashToken(oldToken);

  const result = await query(
    `SELECT id, user_id, token_family_id, family_revoked_at FROM refresh_tokens
     WHERE token_hash = $1`,
    [oldHash],
  );

  const row = result.rows[0] as
    | { id: string; user_id: string; token_family_id: string; family_revoked_at: string | null }
    | undefined;

  if (!row) return null;

  // If already revoked / family already revoked, no new action needed.
  if (row.family_revoked_at) return null;

  // Revoke the entire family and all sessions for this user.
  await query(
    `UPDATE refresh_tokens
        SET family_revoked_at = NOW(),
            revoked_at = COALESCE(revoked_at, NOW())
      WHERE token_family_id = $1`,
    [row.token_family_id],
  );

  return row.user_id;
}

/**
 * Check if a given token string is valid and return user_id.
 * Simpler than rotate() — used by logout and read-only checks.
 */
export async function validate(token: string): Promise<ValidateResult | null> {
  const tokenHash = hashToken(token);

  const result = await query(
    `SELECT id, user_id, token_family_id, family_revoked_at
       FROM refresh_tokens
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1`,
    [tokenHash],
  );

  const row = result.rows[0] as
    | { id: string; user_id: string; token_family_id: string; family_revoked_at: string | null }
    | undefined;

  if (!row) return null;
  if (row.family_revoked_at) return null;

  return {
    userId: row.user_id,
    tokenId: row.id,
    familyId: row.token_family_id,
    familyRevoked: row.family_revoked_at !== null,
  };
}

/**
 * Revoke a specific refresh token.
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
 * Revoke all refresh tokens for a user (e.g., password change, disable).
 */
export async function revokeAllForUser(userId: string): Promise<void> {
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}

/**
 * Revoke all refresh token families for a user (also kills all sessions).
 */
export async function revokeAllFamiliesForUser(userId: string): Promise<void> {
  await query(
    `UPDATE refresh_tokens
        SET family_revoked_at = NOW(),
            revoked_at = COALESCE(revoked_at, NOW())
      WHERE user_id = $1
        AND family_revoked_at IS NULL`,
    [userId],
  );
}

/**
 * Revoke all tokens in a specific family (by family/session id).
 */
export async function revokeByFamily(familyId: string): Promise<void> {
  await query(
    `UPDATE refresh_tokens
        SET revoked_at = NOW(),
            family_revoked_at = COALESCE(family_revoked_at, NOW())
      WHERE token_family_id = $1`,
    [familyId],
  );
}

/**
 * Clean up expired refresh tokens.
 */
export async function cleanupExpired(): Promise<number> {
  const result = await query(`DELETE FROM refresh_tokens WHERE expires_at < NOW()`);
  return result.rowCount ?? 0;
}
