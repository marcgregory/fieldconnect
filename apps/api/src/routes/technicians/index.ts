import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/auth';
import * as technicianQueries from '../../db/queries/technicians';

export async function technicianRoutes(app: FastifyInstance) {
  // ─── My Assignments (for the logged-in technician) ──────────────────────
  app.get(
    '/api/v1/technicians/assignments',
    { preHandler: [requireRole('field_technician', 'admin')] },
    async (request, reply) => {
      const assignments = await technicianQueries.findAssignmentsByUser(
        request.user!.id,
      );
      return { success: true, data: assignments };
    },
  );

  // ─── List Available Technicians (for office to assign) ─────────────────
  app.get(
    '/api/v1/technicians/available',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (_request, reply) => {
      const technicians = await technicianQueries.findAvailableTechnicians();
      return { success: true, data: technicians };
    },
  );
}
