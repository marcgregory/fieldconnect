import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import * as refreshTokenQueries from '../../db/queries/refresh-tokens';
import * as sessions from '../../db/queries/sessions';
import * as authAuditLog from '../../db/queries/auth-audit-logs';
import { findById } from '../../db/queries/users';

const getSecret = (): Uint8Array => {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET environment variable is not set');
  return new TextEncoder().encode(secret);
};

export async function refreshRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/auth/refresh
   * Body: { refresh_token: string }
   *
   * Rotates the refresh token and returns a new access JWT (15 min).
   * On reuse detection (an already-rotated token is presented), the entire
   * token family is revoked and all sessions are invalidated.
   */
  app.post('/api/v1/auth/refresh', async (request, reply) => {
    const { refresh_token } = request.body as { refresh_token?: string };
    if (!refresh_token) {
      return reply.status(400).send({
        success: false,
        error: 'refresh_token is required',
      });
    }

    // ── 1. Attempt rotation ───────────────────────────────────────────────
    const rotated = await refreshTokenQueries.rotate(
      refresh_token,
      request.headers['user-agent']?.slice(0, 500),
      request.ip,
    );

    if (rotated) {
      // Success — old token revoked, new token issued.
      const user = await findById(rotated.userId);
      if (!user) {
        return reply.status(401).send({
          success: false,
          error: 'User not found',
        });
      }

      // If unverified, reject rotation and revoke the new token too.
      if (!user.email_verified_at && !process.env.SKIP_EMAIL_VERIFICATION) {
        await refreshTokenQueries.revokeByFamily(rotated.familyId);
        await authAuditLog.log(
          user.id,
          'login_blocked_unverified',
          { via: 'refresh' },
          request.ip,
        );
        return reply.status(403).send({
          success: false,
          code: 'EMAIL_NOT_VERIFIED',
          error: 'Please verify your email before signing in.',
          canResend: true,
        });
      }

      // Touch the session
      await sessions.touch(rotated.familyId);

      // Issue new access JWT (15 min short-lived)
      const accessToken = await new SignJWT({
        sub: user.id,
        id: user.id,
        role: user.role,
        email: user.email,
        name: user.name,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setIssuer('fieldconnect-api')
        .setAudience('fieldconnect-web')
        .setExpirationTime('15m')
        .sign(getSecret());

      await authAuditLog.log(
        user.id,
        'token_refreshed',
        { session_id: rotated.familyId },
        request.ip,
      );

      return {
        success: true,
        access_token: accessToken,
        refresh_token: rotated.newToken,
        expires_in: 900,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    }

    // ── 2. Rotation failed — check for reuse ──────────────────────────────
    const userId = await refreshTokenQueries.detectReuse(refresh_token);
    if (userId) {
      await sessions.revokeAllForUser(userId);
      await authAuditLog.log(
        userId,
        'refresh_token_reuse_detected',
        { ip: request.ip },
        request.ip,
      );
      await authAuditLog.log(
        userId,
        'all_sessions_revoked',
        { reason: 'refresh_token_reuse' },
        request.ip,
      );
    }

    return reply.status(401).send({
      success: false,
      error: 'Invalid or expired refresh token',
    });
  });

  /**
   * POST /api/v1/auth/logout
   * Body: { refresh_token: string }
   * Revokes the refresh token and its session.
   */
  app.post('/api/v1/auth/logout', async (request, reply) => {
    const { refresh_token } = request.body as { refresh_token?: string };
    if (refresh_token) {
      const validated = await refreshTokenQueries.validate(refresh_token);
      if (validated) {
        await refreshTokenQueries.revoke(refresh_token);
        await sessions.revoke(validated.familyId);
        await authAuditLog.log(
          validated.userId,
          'logout',
          { session_id: validated.familyId },
          request.ip,
        );
      }
    }
    return { success: true };
  });

}
