/**
 * Refresh Token Rotation Tests
 *
 * Scenario (Sprint 6 — Session Security): when the client swaps a refresh
 * token for a new access JWT, the old refresh token is revoked and a new
 * opaque token is issued. Replay of an already-rotated token (reuse
 * detection) must revoke the entire token family.
 *
 * What this test verifies:
 *   1. A valid refresh token can be rotated once (standard flow)
 *   2. Rotating again with the old token triggers family-wide revocation
 *   3. After family revocation, the new token is also invalid
 *   4. An unverified user attempting refresh gets 403
 *
 * Uses the login endpoint to produce real refresh tokens (matching the
 * production path), then exercises the refresh endpoint directly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp, closeTestApp } from '../../helpers/app';
import { assertTestDbSafe } from '../../setup/test-db';
import { closePool } from '../../setup/factories';
import type { FastifyInstance } from 'fastify';

describe('Refresh token rotation', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    assertTestDbSafe();
    app = await getTestApp();
  });

  afterAll(async () => {
    await closePool();
    await closeTestApp();
  });

  /**
   * Generate a real refresh token by registering + logging in.
   * Creates ephemeral users so the login flow produces tokens.
   */
  async function registerAndLogin(): Promise<{
    refresh_token: string;
    userId: string;
  }> {
    const email = `rotation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@fieldconnect.test`;
    const password = 'testPass123!';

    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        email,
        name: 'Rotation User',
        password,
        role: 'field_technician',
      }),
    });
    expect(reg.statusCode).toBe(201);
    const user = reg.json();
    expect(user.id).toBeTruthy();

    // Mark email verified so the refresh flow works
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    await pool.query('UPDATE users SET email_verified_at = NOW() WHERE id = $1', [user.id]);
    await pool.end();

    // Now login
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ email, password }),
    });
    expect(login.statusCode).toBe(200);
    const body = login.json();
    expect(body.refresh_token).toBeTruthy();

    return { refresh_token: body.refresh_token, userId: user.id };
  }

  it('rotates a valid refresh token (standard flow)', async () => {
    const { refresh_token: tok1 } = await registerAndLogin();

    // Rotate
    const rot1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ refresh_token: tok1 }),
    });
    expect(rot1.statusCode).toBe(200);
    const body1 = rot1.json();
    expect(body1.success).toBe(true);
    expect(body1.access_token).toBeTruthy();
    expect(body1.refresh_token).toBeTruthy();
    expect(body1.refresh_token).not.toBe(tok1); // must be a new token
    expect(body1.expires_in).toBe(900); // 15 min
    expect(body1.user.role).toBe('field_technician');

    // The old token should now be invalid
    const reuse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ refresh_token: tok1 }),
    });
    expect(reuse.statusCode).toBe(401);
  });

  it('detects reuse and revokes the entire token family', async () => {
    const { refresh_token: tok1, userId } = await registerAndLogin();

    // First rotation — success
    const rot1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ refresh_token: tok1 }),
    });
    expect(rot1.statusCode).toBe(200);
    const body1 = rot1.json();
    const tok2 = body1.refresh_token;

    // Replay the first token — should detect reuse AND revoke the entire family
    const reuse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ refresh_token: tok1 }),
    });
    expect(reuse.statusCode).toBe(401);

    // After reuse detection, the second token (tok2) should ALSO be invalid
    // because the entire family was revoked.
    const rot2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ refresh_token: tok2 }),
    });
    expect(rot2.statusCode).toBe(401);

    // All sessions for this user should have been revoked too.
    // Sessions are identified by the family_id, which maps to session entries.
    // We can check by trying to login and log, but for now just check
    // that the token family is dead.
  });

  it('rejects an invalid (garbage) refresh token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ refresh_token: 'this-is-not-a-real-token' }),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });

  it('rejects a missing refresh_token field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('refresh_token is required');
  });

  it('rejects refresh for unverified user', async () => {
    // Register a user but do NOT mark email verified
    const email = `unverified-${Date.now()}@fieldconnect.test`;
    const password = 'testPass123!';

    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        email,
        name: 'Unverified User',
        password,
        role: 'field_technician',
      }),
    });
    expect(reg.statusCode).toBe(201);
    const user = reg.json();

    // Login still works (login does not check email_verified_at)
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ email, password }),
    });
    expect(login.statusCode).toBe(200);
    const loginBody = login.json();
    expect(loginBody.refresh_token).toBeTruthy();

    // Refresh should fail with 403 — email not verified
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ refresh_token: loginBody.refresh_token }),
    });
    expect(refresh.statusCode).toBe(403);
    expect(refresh.json().code).toBe('EMAIL_NOT_VERIFIED');
  });
});
