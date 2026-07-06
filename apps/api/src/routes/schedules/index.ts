import type { FastifyInstance } from 'fastify';
import {
  createScheduleSchema,
  updateScheduleSchema,
  updateScheduleStatusSchema,
  type JobStatus,
} from '@fieldconnect/shared';
import { requireRole } from '../../middleware/auth';
import * as scheduleQueries from '../../db/queries/schedules';
import { ValidationError } from '../../db/queries/schedules';
import * as technicianQueries from '../../db/queries/technicians';
import { broadcastJobEvent } from '../../websocket';
import { jobNoteRoutes } from './job-notes';
import { jobAttachmentRoutes } from './job-attachments';
import { signatureRoutes } from './signatures';

export async function scheduleRoutes(app: FastifyInstance) {
  // --- Register field data sub-routes ----------------------------------------
  await app.register(jobNoteRoutes);
  await app.register(jobAttachmentRoutes);
  await app.register(signatureRoutes);

  // --- List Schedules ---------------------------------------------------------
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

  // --- Calendar Range ---------------------------------------------------------
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

  // --- Review Queue (completed + office_review jobs) --------------------------
  app.get(
    '/api/v1/schedules/review',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (_request, reply) => {
      const schedules = await scheduleQueries.findForReview();
      return { success: true, data: schedules };
    },
  );

  // --- Unassigned Jobs Queue --------------------------------------------------
  app.get(
    '/api/v1/schedules/unassigned',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (_request, reply) => {
      const schedules = await scheduleQueries.findUnassigned();
      return { success: true, data: schedules };
    },
  );

  // --- My Jobs (for logged-in field technician) ------------------------------
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

  // --- Get Single Schedule ----------------------------------------------------
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

  // --- Create Schedule --------------------------------------------------------
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

      // Conflict check (skip if admin sent force: true)
      const { force, ...createData } = parsed.data;

      // Validate technician is a member of the project team
      const teamIds = await technicianQueries.findProjectTeamIds(createData.project_id);
      if (!teamIds.includes(createData.technician_id)) {
        return reply.status(400).send({
          success: false,
          error: 'Technician is not a member of this project team. Add them to the team first.',
        });
      }

      if (!force && createData.start_time && createData.end_time) {
        const conflicts = await scheduleQueries.findConflicts(
          createData.technician_id,
          createData.scheduled_date,
          createData.start_time,
          createData.end_time,
        );
        if (conflicts.length > 0) {
          const canForce = request.user!.role === 'admin';
          return reply.status(409).send({
            success: false,
            error: scheduleQueries.formatConflictError(conflicts),
            conflicts,
            can_force_assign: canForce,
          });
        }
      }

      const schedule = await scheduleQueries.create({
        ...createData,
        created_by: request.user!.id,
      });

      // Broadcast assignment event
      const createdWithDetails = await scheduleQueries.findById(schedule.id);
      broadcastJobEvent({
        type: 'assignment',
        schedule_id: schedule.id,
        project_name: createdWithDetails?.project_name || createData.project_id,
        technician_name: createdWithDetails?.technician_name || '',
        old_status: null,
        new_status: 'scheduled',
        changed_by: request.user!.name,
        timestamp: new Date().toISOString(),
        technician_id: schedule.technician_id,
      });

      return reply.status(201).send({ success: true, data: schedule });
    },
  );

  // --- Update Schedule --------------------------------------------------------
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

      // Conflict check on update (skip if admin sent force: true)
      const { force, ...updateData } = parsed.data;
      if (!force && updateData.start_time && updateData.end_time) {
        const effectiveTechnicianId = updateData.technician_id || existing.technician_id;
        const effectiveDate = updateData.scheduled_date || existing.scheduled_date;
        const effectiveProjectId = updateData.project_id || existing.project_id;

        // Validate technician is a member of the project team
        const teamIds = await technicianQueries.findProjectTeamIds(effectiveProjectId);
        if (!teamIds.includes(effectiveTechnicianId)) {
          return reply.status(400).send({
            success: false,
            error: 'Technician is not a member of this project team. Add them to the team first.',
          });
        }

        const conflicts = await scheduleQueries.findConflicts(
          effectiveTechnicianId,
          effectiveDate,
          updateData.start_time,
          updateData.end_time,
          id, // exclude this schedule from conflict check
        );
        if (conflicts.length > 0) {
          const canForce = request.user!.role === 'admin';
          return reply.status(409).send({
            success: false,
            error: scheduleQueries.formatConflictError(conflicts),
            conflicts,
            can_force_assign: canForce,
          });
        }
      }

      const schedule = await scheduleQueries.update(id, updateData);

      // If technician changed, broadcast reassignment event
      const newTechnicianId = updateData.technician_id;
      if (newTechnicianId && newTechnicianId !== existing.technician_id) {
        const updatedWithDetails = await scheduleQueries.findById(id);
        broadcastJobEvent({
          type: 'reassigned',
          schedule_id: id,
          project_name: existing.project_name,
          technician_name: updatedWithDetails?.technician_name || '',
          old_status: existing.status,
          new_status: existing.status,
          changed_by: request.user!.name,
          timestamp: new Date().toISOString(),
          technician_id: newTechnicianId,
        });
      }

      return { success: true, data: schedule };
    },
  );

  // --- Update Status (Status Transition) ------------------------------------
  app.patch(
    '/api/v1/schedules/:id/status',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher', 'field_technician')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateScheduleStatusSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: parsed.error.errors[0].message,
        });
      }

      // Fetch existing to get technician_id for ownership check
      const existing = await scheduleQueries.findById(id);
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Schedule not found' });
      }

      try {
        const result = await scheduleQueries.updateStatus({
          id,
          status: parsed.data.status as JobStatus,
          user_id: request.user!.id,
          user_role: request.user!.role,
          technician_id: existing.technician_id,
          notes: parsed.data.notes,
        });

        // Broadcast WebSocket event
        broadcastJobEvent({
          type: 'status_change',
          schedule_id: id,
          project_name: result.schedule.project_name,
          technician_name: result.schedule.technician_name,
          old_status: existing.status,
          new_status: result.schedule.status,
          changed_by: request.user!.name,
          timestamp: new Date().toISOString(),
          technician_id: result.schedule.technician_id,
        });

        return { success: true, data: result };
      } catch (err) {
        if (err instanceof ValidationError) {
          return reply.status(err.statusCode).send({
            success: false,
            error: err.message,
          });
        }
        throw err;
      }
    },
  );

  // --- Delete Schedule --------------------------------------------------------
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
