import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/auth';
import * as technicianQueries from '../../db/queries/technicians';
import { findConflicts } from '../../db/queries/schedules';

export interface TechnicianAvailability {
  id: string;
  email: string;
  name: string;
  role: string;
  availability: 'available' | 'busy' | 'buffer_conflict';
  conflict_schedule: {
    project_name: string;
    start_time: string;
    end_time: string;
  } | null;
}

export async function technicianRoutes(app: FastifyInstance) {
  // --- My Assignments (for the logged-in technician) ------------------------
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

  // --- List Available Technicians (for office to assign) -------------------
  app.get(
    '/api/v1/technicians/available',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (request, reply) => {
      const { date, start_time, end_time } = request.query as {
        date?: string;
        start_time?: string;
        end_time?: string;
      };

      const technicians = await technicianQueries.findAvailableTechnicians();

      // If date/time provided, check availability against existing schedules
      if (date && start_time && end_time) {
        const withAvailability: TechnicianAvailability[] = await Promise.all(
          technicians.map(async (t) => {
            const conflicts = await findConflicts(
              [t.id],
              date,
              start_time,
              end_time,
            );
            if (conflicts.length > 0) {
              const hasOverlap = conflicts.some((c) => c.conflict_type === 'overlap');
              return {
                ...t,
                availability: hasOverlap ? 'busy' : 'buffer_conflict' as const,
                conflict_schedule: {
                  project_name: conflicts[0].project_name,
                  start_time: conflicts[0].start_time,
                  end_time: conflicts[0].end_time,
                },
              };
            }
            return {
              ...t,
              availability: 'available' as const,
              conflict_schedule: null,
            };
          }),
        );
        return { success: true, data: withAvailability };
      }

      // Without time params, return basic list with availability as 'available'
      const basic: TechnicianAvailability[] = technicians.map((t) => ({
        ...t,
        availability: 'available' as const,
        conflict_schedule: null,
      }));
      return { success: true, data: basic };
    },
  );
}
