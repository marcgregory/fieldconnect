import type { FastifyInstance } from 'fastify';
import {
  createScheduleSchema,
  updateScheduleSchema,
} from '@fieldconnect/shared';
import { requireRole } from '../../middleware/auth';
import * as scheduleQueries from '../../db/queries/schedules';

export async function scheduleRoutes(app: FastifyInstance) {
  // ─── List Schedules ───────────────────────────────────────────────────────
  app.get('/api/v1/schedules', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const { date, technician_id, project_id, status } = request.query as {
      date?: string;
      technician_id?: string;
      project_id?: string;
      status?: string;
    };

    const schedules = await scheduleQueries.findAll({
      date,
      technician_id,
      project_id,
      status,
    });

    return { success: true, data: schedules };
  });

  // ─── Calendar Range ───────────────────────────────────────────────────────
  app.get('/api/v1/schedules/calendar', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const { from, to } = request.query as { from: string; to: string };
    if (!from || !to) {
      return reply.status(400).send({
        success: false,
        error: 'from and to query parameters are required (YYYY-MM-DD)',
      });
    }

    const schedules = await scheduleQueries.findByDateRange(from, to);
    return { success: true, data: schedules };
  });

  // ─── Unassigned Jobs Queue ────────────────────────────────────────────────
  app.get(
    '/api/v1/schedules/unassigned',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (_request, reply) => {
      const schedules = await scheduleQueries.findUnassigned();
      return { success: true, data: schedules };
    },
  );

  // ─── My Jobs (for logged-in field technician) ────────────────────────────
  app.get(
    '/api/v1/schedules/my-jobs',
    { preHandler: [requireRole('field_technician', 'admin')] },
    async (request, reply) => {
      const schedules = await scheduleQueries.findByTechnician(
        request.user!.id,
      );
      return { success: true, data: schedules };
    },
  );

  // ─── Get Single Schedule ──────────────────────────────────────────────────
  app.get('/api/v1/schedules/:id', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const { id } = request.params as { id: string };
    const schedule = await scheduleQueries.findById(id);

    if (!schedule) {
      return reply.status(404).send({ success: false, error: 'Schedule not found' });
    }

    return { success: true, data: schedule };
  });

  // ─── Create Schedule ──────────────────────────────────────────────────────
  app.post(
    '/api/v1/schedules',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (request, reply) => {
      const parsed = createScheduleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: parsed.error.errors[0].message,
        });
      }

      const schedule = await scheduleQueries.create({
        ...parsed.data,
        created_by: request.user!.id,
      });

      return reply.status(201).send({ success: true, data: schedule });
    },
  );

  // ─── Update Schedule ──────────────────────────────────────────────────────
  app.put(
    '/api/v1/schedules/:id',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateScheduleSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: parsed.error.errors[0].message,
        });
      }

      const existing = await scheduleQueries.findById(id);
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Schedule not found' });
      }

      const schedule = await scheduleQueries.update(id, parsed.data);
      return { success: true, data: schedule };
    },
  );

  // ─── Delete Schedule ──────────────────────────────────────────────────────
  app.delete(
    '/api/v1/schedules/:id',
    { preHandler: [requireRole('admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const deleted = await scheduleQueries.deleteById(id);
      if (!deleted) {
        return reply.status(404).send({ success: false, error: 'Schedule not found' });
      }

      return { success: true, data: { deleted: true } };
    },
  );
}
