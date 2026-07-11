import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { requireRole } from '../../middleware/auth';

const getSecret = (): Uint8Array => {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
};

export async function tokenRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/auth/token
   * Returns a short-lived JWT for Socket.io authentication.
   * Requires an existing valid session (JWT in Authorization header).
   */
  app.post(
    '/api/v1/auth/token',
    { preHandler: [requireRole()] }, // any authenticated user
    async (request, reply) => {
      const user = request.user!;

      const token = await new SignJWT({
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
        .setExpirationTime('5m') // short-lived, only for socket handshake
        .sign(getSecret());

      return { success: true, token };
    },
  );
}
