import { query } from '../index';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  password_hash: string;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function findByEmail(email: string): Promise<UserRow | null> {
  const result = await query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

export async function findById(id: string): Promise<UserRow | null> {
  const result = await query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function createUser(data: {
  email: string;
  name: string;
  passwordHash: string;
  role: string;
}): Promise<UserRow> {
  const result = await query(
    `INSERT INTO users (email, name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.email, data.name, data.passwordHash, data.role],
  );
  return result.rows[0];
}

/**
 * Mark a user's email as verified. Sets `email_verified_at = NOW()` and bumps
 * `updated_at`. Returns the updated row, or null if the user doesn't exist.
 *
 * Called inside the verification transaction so the user update and the
 * token-used update are atomic — see `routes/auth/verification.ts`.
 */
/**
 * Update a user's password hash. Sets `updated_at = NOW()`. Returns the
 * updated row, or null if the user doesn't exist.
 *
 * Called during password reset (Phase 3) and future change-password flows.
 */
export async function setPasswordHash(id: string, hash: string): Promise<UserRow | null> {
  const result = await query(
    `UPDATE users
       SET password_hash = $2,
           updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, hash],
  );
  return result.rows[0] || null;
}

export async function markEmailVerified(id: string): Promise<UserRow | null> {
  const result = await query(
    `UPDATE users
       SET email_verified_at = NOW(),
           updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id],
  );
  return result.rows[0] || null;
}
