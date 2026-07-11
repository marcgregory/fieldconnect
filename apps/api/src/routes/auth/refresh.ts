import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import * as refreshTokenQueries from '../../db/queries/refresh-tokens';
import * as authAuditLog from '../../db/queries/auth-audit-logs';

const getSecret = (): Uint8Array => {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET environment variable is not set');
  return new TextEncoder().encode(secret);
};

export async function refreshRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/auth/refresh
   * Body: { refresh_token: string }
   * Returns a new backend JWT (1h) and a new refresh token (rotation).
   */
  app.post('/api/v1/auth/refresh', async (request, reply) => {
    const { refresh_token } = request.body as { refresh_token?: string };
    if (!refresh_token) {
      return reply.status(400).send({
        success: false,
        error: 'refresh_token is required',
      });
    }

    // Validate the refresh token
    const userId = await refreshTokenQueries.validate(refresh_token);
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid or expired refresh token',
      });
    }

    // Fetch user info BEFORE revoking — we need email_verified_at to decide
    // whether to rotate or reject. (Old refresh tokens issued before this
    // phase might still be valid even though the user hasn't verified.)
    const { findById } = await import('../../db/queries/users');
    const user = await findById(userId);
    if (!user) {
      return reply.status(401).send({
        success: false,
        error: 'User not found',
      });
    }

    // If the user is unverified, refuse to rotate and revoke the token.
    // Forces them back through the login flow which will surface the 403.
    if (!user.email_verified_at) {
      await refreshTokenQueries.revoke(refresh_token);
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

    // Revoke the old token (rotation)
    await refreshTokenQueries.revoke(refresh_token);

    // Issue new access JWT (1h)
    const accessToken = await new SignJWT({
      sub: user.id,
      id: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(getSecret());

    // Issue new refresh token (30 days)
    const newRefreshToken = await refreshTokenQueries.create(
      userId,
      request.headers['user-agent']?.slice(0, 500),
      request.ip,
    );

    return {
      success: true,
      access_token: accessToken,
      refresh_token: newRefreshToken,
      expires_in: 3600,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  });

  /**
   * POST /api/v1/auth/logout
   * Body: { refresh_token: string }
   * Revokes the refresh token.
   */
  app.post('/api/v1/auth/logout', async (request, reply) => {
    const { refresh_token } = request.body as { refresh_token?: string };
    if (refresh_token) {
      await refreshTokenQueries.revoke(refresh_token);
    }
    return { success: true };
  });
}
