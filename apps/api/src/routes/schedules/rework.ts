import type { FastifyInstance } from 'fastify';
import { createReworkSchema } from '@fieldconnect/shared';
import { requireRole } from '../../middleware/auth';
import * as reworkQueries from '../../db/queries/rework';
import * as scheduleQueries from '../../db/queries/schedules';
import { broadcastJobEvent } from '../../websocket';

export async function reworkRoutes(app: FastifyInstance) {
  // ─── Request Rework ───────────────────────────────────────────────────────
  // Creates a rework request AND transitions the specific technician to rework_required
  app.post(
    '/api/v1/schedules/:id/rework',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { technician_id, ...restBody } = request.body as Record<string, unknown>;
      const parsed = createReworkSchema.safeParse(restBody);

      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: parsed.error.errors[0].message,
        });
      }

      if (!technician_id) {
        return reply.status(400).send({
          success: false,
          error: 'technician_id is required to request rework for a specific technician',
        });
      }

      const existing = await scheduleQueries.findById(id);
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Schedule not found' });
      }

      // Verify the technician is assigned to this schedule
      if (!existing.technician_ids.includes(technician_id as string)) {
        return reply.status(400).send({
          success: false,
          error: 'Technician is not assigned to this schedule',
        });
      }

      // Verify the technician is in a completed state
      const techWorkflow = existing.technician_workflow.find(
        (tw) => tw.technician_id === technician_id
      );
      if (!techWorkflow || techWorkflow.status !== 'completed') {
        return reply.status(400).send({
          success: false,
          error: 'Rework can only be requested for technicians who have completed their work',
        });
      }

      try {
        // Create the rework request
        const rework = await reworkQueries.createReworkRequest(
          id,
          parsed.data.reason,
          request.user!.id,
        );

        // Transition only the specific technician to rework_required
        const result = await scheduleQueries.updateStatus({
          id,
          status: 'rework_required',
          user_id: request.user!.id,
          user_role: request.user!.role,
          technician_id: technician_id as string,
          notes: `Rework requested: ${parsed.data.reason}`,
        });

        // Broadcast WebSocket event to the affected technician
        broadcastJobEvent({
          type: 'status_change',
          schedule_id: id,
          project_name: result.schedule.project_name,
          technician_name: result.schedule.technician_name,
          old_status: 'completed',
          new_status: 'rework_required',
          changed_by: request.user!.name,
          timestamp: new Date().toISOString(),
          technician_id: technician_id as string,
        });

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
      const { technician_id } = request.body as Record<string, unknown>;
      const targetTechId = (technician_id as string) || request.user!.id;

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
          technician_id: targetTechId,
          notes: 'Resumed work for rework',
        });

        // Broadcast WebSocket event
        broadcastJobEvent({
          type: 'status_change',
          schedule_id: id,
          project_name: result.schedule.project_name,
          technician_name: result.schedule.technician_name,
          old_status: 'rework_required',
          new_status: 'on_site',
          changed_by: request.user!.name,
          timestamp: new Date().toISOString(),
          technician_id: targetTechId,
        });

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
      const { technician_id } = request.body as Record<string, unknown>;
      const targetTechId = (technician_id as string) || request.user!.id;

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

        // Transition technician back to completed
        const result = await scheduleQueries.updateStatus({
          id,
          status: 'completed',
          user_id: request.user!.id,
          user_role: request.user!.role,
          technician_id: targetTechId,
          notes: 'Rework completed',
        });

        // Broadcast WebSocket event
        broadcastJobEvent({
          type: 'status_change',
          schedule_id: id,
          project_name: result.schedule.project_name,
          technician_name: result.schedule.technician_name,
          old_status: 'on_site',
          new_status: 'completed',
          changed_by: request.user!.name,
          timestamp: new Date().toISOString(),
          technician_id: targetTechId,
        });

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
