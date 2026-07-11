import { query } from '../index';

export interface SessionRow {
  id: string;
  user_id: string;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  revoked_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

/**
 * Create a new session for a user.
 */
export async function create(
  userId: string,
  ipAddress?: string,
  userAgent?: string,
  ttlDays = 30,
): Promise<string> {
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  const result = await query(
    `INSERT INTO sessions (user_id, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, ipAddress ?? null, userAgent?.slice(0, 500) ?? null, expiresAt],
  );

  return result.rows[0].id as string;
}

/**
 * Get all active (not revoked, not expired) sessions for a user.
 */
export async function listActive(userId: string): Promise<SessionRow[]> {
  const result = await query(
    `SELECT id, user_id, created_at, last_used_at, expires_at,
            revoked_at, ip_address, user_agent
       FROM sessions
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      ORDER BY last_used_at DESC`,
    [userId],
  );
  return result.rows as SessionRow[];
}

/**
 * Get a single session by id.
 */
export async function findById(sessionId: string): Promise<SessionRow | null> {
  const result = await query(
    `SELECT id, user_id, created_at, last_used_at, expires_at,
            revoked_at, ip_address, user_agent
       FROM sessions WHERE id = $1`,
    [sessionId],
  );
  return (result.rows[0] as SessionRow) || null;
}

/**
 * Revoke a single session by id. Returns the user_id of the owner, or null
 * if the session didn't exist or was already revoked.
 */
export async function revoke(sessionId: string): Promise<string | null> {
  const result = await query(
    `UPDATE sessions
        SET revoked_at = NOW()
      WHERE id = $1 AND revoked_at IS NULL
      RETURNING user_id`,
    [sessionId],
  );
  return result.rows[0]?.user_id || null;
}

/**
 * Revoke all sessions for a user (except the current session id, if provided).
 * Returns the count of revoked sessions.
 */
export async function revokeAllForUser(
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  let sql = `UPDATE sessions SET revoked_at = NOW()
              WHERE user_id = $1 AND revoked_at IS NULL`;
  const params: unknown[] = [userId];

  if (exceptSessionId) {
    sql += ` AND id != $2`;
    params.push(exceptSessionId);
  }

  const result = await query(sql, params);
  return result.rowCount ?? 0;
}

/**
 * Touch (update last_used_at) a session.
 */
export async function touch(sessionId: string): Promise<void> {
  await query(
    `UPDATE sessions SET last_used_at = NOW() WHERE id = $1`,
    [sessionId],
  );
}

/**
 * Delete expired sessions older than 7 days.
 */
export async function cleanExpired(): Promise<number> {
  const result = await query(
    `DELETE FROM sessions WHERE expires_at < NOW() - INTERVAL '7 days'`,
  );
  return result.rowCount ?? 0;
}
