import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/auth';
import * as reportQueries from '../../db/queries/reports';

export async function dashboardRoutes(app: FastifyInstance) {
  // ─── Dashboard Summary ────────────────────────────────────────────────────
  app.get(
    '/api/v1/dashboard/summary',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (_request, reply) => {
      const summary = await reportQueries.getDashboardSummary();
      return { success: true, data: summary };
    },
  );
}
