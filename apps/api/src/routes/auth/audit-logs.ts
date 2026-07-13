import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/auth';
import * as authAuditLog from '../../db/queries/auth-audit-logs';

export async function authAuditRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/auth/audit-logs
   * Returns paginated auth audit events. Admin-only.
   */
  app.get(
    '/api/v1/auth/audit-logs',
    { preHandler: [requireRole('admin')] },
    async (request) => {
      const query = request.query as {
        limit?: string;
        offset?: string;
        userId?: string;
        action?: string;
        dateFrom?: string;
        dateTo?: string;
      };

      const result = await authAuditLog.list({
        limit: parseInt(query.limit || '50', 10),
        offset: parseInt(query.offset || '0', 10),
        userId: query.userId || undefined,
        action: query.action || undefined,
        dateFrom: query.dateFrom || undefined,
        dateTo: query.dateTo || undefined,
      });

      return {
        success: true,
        events: result.events,
        total: result.total,
        limit: parseInt(query.limit || '50', 10),
        offset: parseInt(query.offset || '0', 10),
      };
    },
  );

  /**
   * GET /api/v1/auth/audit-logs/actions
   * Returns the distinct set of audit actions for filter dropdowns.
   */
  app.get(
    '/api/v1/auth/audit-logs/actions',
    { preHandler: [requireRole('admin')] },
    async () => {
      const actions = await authAuditLog.listActions();
      return { success: true, actions };
    },
  );

  /**
   * GET /api/v1/auth/audit-logs/summary
   * Returns event counts grouped by action for the last N hours (default 24).
   */
  app.get(
    '/api/v1/auth/audit-logs/summary',
    { preHandler: [requireRole('admin')] },
    async (request) => {
      const query = request.query as { hours?: string };
      const hours = parseInt(query.hours || '24', 10);
      const summary = await authAuditLog.getSummary(hours);
      return { success: true, summary, hours };
    },
  );
}
