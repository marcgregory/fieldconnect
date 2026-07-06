import type { FastifyInstance } from 'fastify';
import { clockInSchema, clockOutSchema } from '@fieldconnect/shared';
import { requireRole } from '../../middleware/auth';
import * as timeEntryQueries from '../../db/queries/time-entries';
import * as projectQueries from '../../db/queries/projects';
import { broadcastClockEvent } from '../../websocket';

export async function timeEntryRoutes(app: FastifyInstance) {
  // ─── Clock In ───────────────────────────────────────────────────────────
  app.post(
    '/api/v1/time-entries/clock-in',
    { preHandler: [requireRole('field_technician', 'admin')] },
    async (request, reply) => {
      const parsed = clockInSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: parsed.error.errors[0].message,
        });
      }

      // Check that the technician is assigned to this project
      const { project_id, notes, clock_in_lat, clock_in_lng } = parsed.data;

      // Verify project exists
      const project = await projectQueries.findById(project_id);
      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        });
      }

      // Check no active time entry already
      const active = await timeEntryQueries.findActiveByUser(request.user!.id);
      if (active) {
        return reply.status(409).send({
          success: false,
          error: 'You already have an active time entry. Please clock out first.',
          data: { active_entry: active },
        });
      }

      const entry = await timeEntryQueries.clockIn(
        request.user!.id,
        project_id,
        notes,
        clock_in_lat,
        clock_in_lng,
      );

      // Broadcast clock-in event
      broadcastClockEvent({
        type: 'clock_in',
        user_id: request.user!.id,
        user_name: request.user!.name,
        project_id,
        project_name: project.name,
        timestamp: entry.clock_in,
        entry_id: entry.id,
        clock_in_lat,
        clock_in_lng,
      });

      return reply.status(201).send({ success: true, data: entry });
    },
  );

  // ─── Clock Out ──────────────────────────────────────────────────────────
  app.post(
    '/api/v1/time-entries/clock-out',
    { preHandler: [requireRole('field_technician', 'admin')] },
    async (request, reply) => {
      const parsed = clockOutSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: parsed.error.errors[0].message,
        });
      }

      const { notes, clock_out_lat, clock_out_lng } = parsed.data;

      // Find the active entry for this user
      const active = await timeEntryQueries.findActiveByUser(request.user!.id);
      if (!active) {
        return reply.status(404).send({
          success: false,
          error: 'No active time entry found',
        });
      }

      const entry = await timeEntryQueries.clockOut(
        active.id,
        notes,
        clock_out_lat,
        clock_out_lng,
      );
      if (!entry) {
        return reply.status(409).send({
          success: false,
          error: 'Could not clock out. Entry may already be closed.',
        });
      }

      // Calculate duration in hours
      const clockInTime = new Date(entry.clock_in).getTime();
      const clockOutTime = new Date(entry.clock_out!).getTime();
      const totalMinutes = (clockOutTime - clockInTime) / 60000;
      const durationHours = Math.round((totalMinutes - entry.break_minutes) / 60 * 100) / 100;

      // Get project name for broadcast
      const project = await projectQueries.findById(entry.project_id);

      // Broadcast clock-out event
      broadcastClockEvent({
        type: 'clock_out',
        user_id: request.user!.id,
        user_name: request.user!.name,
        project_id: entry.project_id,
        project_name: project?.name || 'Unknown',
        timestamp: entry.clock_out!,
        entry_id: entry.id,
        duration_hours: durationHours,
      });

      return reply.status(200).send({
        success: true,
        data: {
          ...entry,
          duration_hours: durationHours,
        },
      });
    },
  );

  // ─── Get Current Active Entry ───────────────────────────────────────────
  app.get(
    '/api/v1/time-entries/current',
    { preHandler: [requireRole('field_technician', 'admin')] },
    async (request, reply) => {
      const active = await timeEntryQueries.findActiveByUser(request.user!.id);
      return reply.status(200).send({
        success: true,
        data: active || null,
      });
    },
  );

  // ─── List Time Entries ──────────────────────────────────────────────────
  app.get('/api/v1/time-entries', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const { project_id, from, to } = request.query as {
      project_id?: string;
      from?: string;
      to?: string;
    };

    const entries = await timeEntryQueries.findByUser(request.user.id, {
      project_id,
      from,
      to,
    });

    return reply.status(200).send({ success: true, data: entries });
  });
}
