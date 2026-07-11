import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/auth';
import * as sessions from '../../db/queries/sessions';
import * as refreshTokenQueries from '../../db/queries/refresh-tokens';
import * as authAuditLog from '../../db/queries/auth-audit-logs';

export async function sessionRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/auth/sessions
   * Returns all active sessions for the authenticated user.
   */
  app.get(
    '/api/v1/auth/sessions',
    { preHandler: [requireRole()] },
    async (request, reply) => {
      const userId = request.user!.id;
      const activeSessions = await sessions.listActive(userId);

      return {
        success: true,
        sessions: activeSessions.map((s) => ({
          id: s.id,
          ipAddress: s.ip_address,
          userAgent: s.user_agent,
          createdAt: s.created_at,
          lastUsedAt: s.last_used_at,
          expiresAt: s.expires_at,
          current: s.id === (request.headers['x-session-id'] as string | undefined),
        })),
      };
    },
  );

  /**
   * DELETE /api/v1/auth/sessions/:id
   * Revoke a specific session.
   */
  app.delete(
    '/api/v1/auth/sessions/:id',
    { preHandler: [requireRole()] },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params as { id: string };

      // Verify the session belongs to the current user.
      const session = await sessions.findById(id);
      if (!session || session.user_id !== userId) {
        return reply.status(404).send({
          success: false,
          error: 'Session not found',
        });
      }

      await sessions.revoke(id);
      await refreshTokenQueries.revokeByFamily(id);

      await authAuditLog.log(
        userId,
        'session_revoked',
        { session_id: id },
        request.ip,
      );

      return { success: true };
    },
  );

  /**
   * POST /api/v1/auth/logout-all
   * Revokes ALL sessions for the authenticated user (except current).
   */
  app.post(
    '/api/v1/auth/logout-all',
    { preHandler: [requireRole()] },
    async (request, reply) => {
      const userId = request.user!.id;
      const currentSessionId = request.headers['x-session-id'] as string | undefined;

      await refreshTokenQueries.revokeAllFamiliesForUser(userId);
      const count = await sessions.revokeAllForUser(userId, currentSessionId);

      await authAuditLog.log(
        userId,
        'logout_all',
        { revoked_count: count, except_session: currentSessionId ?? null },
        request.ip,
      );

      return { success: true, revokedCount: count };
    },
  );
}
