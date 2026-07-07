import type { FastifyInstance } from 'fastify';
import { createReworkSchema } from '@fieldconnect/shared';
import { requireRole } from '../../middleware/auth';
import * as reworkQueries from '../../db/queries/rework';
import * as scheduleQueries from '../../db/queries/schedules';
import { broadcastJobEvent } from '../../websocket';

export async function reworkRoutes(app: FastifyInstance) {
  // ─── Request Rework ───────────────────────────────────────────────────────
  // Creates a rework request AND transitions schedule to rework_required
  app.post(
    '/api/v1/schedules/:id/rework',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = createReworkSchema.safeParse(request.body);

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

      // Only allow rework on completed jobs
      if (existing.status !== 'completed') {
        return reply.status(400).send({
          success: false,
          error: 'Rework can only be requested for completed jobs',
        });
      }

      try {
        // Create the rework request
        const rework = await reworkQueries.createReworkRequest(
          id,
          parsed.data.reason,
          request.user!.id,
        );

        // Transition schedule to rework_required
        const result = await scheduleQueries.updateStatus({
          id,
          status: 'rework_required',
          user_id: request.user!.id,
          user_role: request.user!.role,
          technician_id: existing.technician_ids[0] || '',
          notes: `Rework requested: ${parsed.data.reason}`,
        });

        // Broadcast WebSocket event for each technician
        for (const techId of existing.technician_ids) {
          broadcastJobEvent({
            type: 'status_change',
            schedule_id: id,
            project_name: result.schedule.project_name,
            technician_name: result.schedule.technician_name,
            old_status: 'completed',
            new_status: 'rework_required',
            changed_by: request.user!.name,
            timestamp: new Date().toISOString(),
            technician_id: techId,
          });
        }

        return reply.status(201).send({
          success: true,
          data: {
            rework,
            schedule: result.schedule,
            audit: result.audit,
          },
        });
      } catch (err) {
        if (err instanceof reworkQueries.ValidationError) {
          return reply.status(err.statusCode).send({
            success: false,
            error: err.message,
          });
        }
        if (err instanceof scheduleQueries.ValidationError) {
          return reply.status(err.statusCode).send({
            success: false,
            error: err.message,
          });
        }
        throw err;
      }
    },
  );

  // ─── List Rework Requests ─────────────────────────────────────────────────
  app.get(
    '/api/v1/schedules/:id/rework',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher', 'field_technician')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const reworks = await reworkQueries.findReworkRequestsBySchedule(id);
      return { success: true, data: reworks };
    },
  );

  // ─── Resume Work (transition rework_required → on_site) ───────────────────
  app.patch(
    '/api/v1/schedules/:id/rework/:rid/resume',
    { preHandler: [requireRole('admin', 'field_technician')] },
    async (request, reply) => {
      const { id, rid } = request.params as { id: string; rid: string };

      const existing = await scheduleQueries.findById(id);
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Schedule not found' });
      }

      // Verify the rework request exists and is open
      const rework = await reworkQueries.getLatestOpenRework(id);
      if (!rework || rework.id !== rid) {
        return reply.status(400).send({
          success: false,
          error: 'No open rework request found',
        });
      }

      try {
        const result = await scheduleQueries.updateStatus({
          id,
          status: 'on_site',
          user_id: request.user!.id,
          user_role: request.user!.role,
          technician_id: existing.technician_ids[0] || '',
          notes: 'Resumed work for rework',
        });

        // Broadcast WebSocket event
        for (const techId of existing.technician_ids) {
          broadcastJobEvent({
            type: 'status_change',
            schedule_id: id,
            project_name: result.schedule.project_name,
            technician_name: result.schedule.technician_name,
            old_status: 'rework_required',
            new_status: 'on_site',
            changed_by: request.user!.name,
            timestamp: new Date().toISOString(),
            technician_id: techId,
          });
        }

        return { success: true, data: result };
      } catch (err) {
        if (err instanceof scheduleQueries.ValidationError) {
          return reply.status(err.statusCode).send({
            success: false,
            error: err.message,
          });
        }
        throw err;
      }
    },
  );

  // ─── Complete Rework ───────────────────────────────────────────────────────
  // Resolves the open rework request and transitions back to completed
  app.patch(
    '/api/v1/schedules/:id/rework/:rid/complete',
    { preHandler: [requireRole('admin', 'field_technician')] },
    async (request, reply) => {
      const { id, rid } = request.params as { id: string; rid: string };

      const existing = await scheduleQueries.findById(id);
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Schedule not found' });
      }

      // Verify the rework request exists and is open
      const rework = await reworkQueries.getLatestOpenRework(id);
      if (!rework || rework.id !== rid) {
        return reply.status(400).send({
          success: false,
          error: 'No open rework request found',
        });
      }

      try {
        // Resolve the rework request
        await reworkQueries.resolveReworkRequest(rid);

        // Transition schedule back to completed
        const result = await scheduleQueries.updateStatus({
          id,
          status: 'completed',
          user_id: request.user!.id,
          user_role: request.user!.role,
          technician_id: existing.technician_ids[0] || '',
          notes: 'Rework completed',
        });

        // Broadcast WebSocket event
        for (const techId of existing.technician_ids) {
          broadcastJobEvent({
            type: 'status_change',
            schedule_id: id,
            project_name: result.schedule.project_name,
            technician_name: result.schedule.technician_name,
            old_status: 'on_site',
            new_status: 'completed',
            changed_by: request.user!.name,
            timestamp: new Date().toISOString(),
            technician_id: techId,
          });
        }

        return { success: true, data: result };
      } catch (err) {
        if (err instanceof scheduleQueries.ValidationError) {
          return reply.status(err.statusCode).send({
            success: false,
            error: err.message,
          });
        }
        throw err;
      }
    },
  );
}
