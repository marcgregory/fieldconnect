import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/auth';
import { findRecentActivity } from '../../db/queries/activity-events';

export async function activityRoutes(app: FastifyInstance) {
  // ─── List Recent Activity ──────────────────────────────────────────────────
  app.get(
    '/api/v1/activity',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (request, reply) => {
      const { limit } = request.query as { limit?: string };
      const parsedLimit = limit ? parseInt(limit, 10) : 50;

      const events = await findRecentActivity(parsedLimit);
      return { success: true, data: events };
    },
  );
}
