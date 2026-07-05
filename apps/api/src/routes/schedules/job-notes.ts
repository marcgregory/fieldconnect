import type { FastifyInstance } from 'fastify';
import {
  createJobNoteSchema,
  type CreateJobNoteInput,
} from '@fieldconnect/shared';
import { requireRole } from '../../middleware/auth';
import * as jobNoteQueries from '../../db/queries/job-notes';
import * as scheduleQueries from '../../db/queries/schedules';

export async function jobNoteRoutes(app: FastifyInstance) {
  // ─── List Notes ──────────────────────────────────────────────────────────
  app.get('/api/v1/schedules/:id/notes', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const { id } = request.params as { id: string };
    const notes = await jobNoteQueries.findBySchedule(id);
    return { success: true, data: notes };
  });

  // ─── Add Note ───────────────────────────────────────────────────────────
  app.post(
    '/api/v1/schedules/:id/notes',
    { preHandler: [requireRole('field_technician', 'admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = createJobNoteSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: parsed.error.errors[0].message,
        });
      }

      // Verify schedule exists
      const schedule = await scheduleQueries.findById(id);
      if (!schedule) {
        return reply.status(404).send({ success: false, error: 'Schedule not found' });
      }

      // Field technicians can only add notes to their own jobs
      if (
        request.user!.role === 'field_technician' &&
        schedule.technician_id !== request.user!.id
      ) {
        return reply.status(403).send({
          success: false,
          error: 'You can only add notes to your own jobs',
        });
      }

      // Internal notes restricted to admin
      if (
        parsed.data.note_type === 'internal' &&
        request.user!.role !== 'admin'
      ) {
        return reply.status(403).send({
          success: false,
          error: 'Only admins can add internal notes',
        });
      }

      const note = await jobNoteQueries.create({
        schedule_id: id,
        user_id: request.user!.id,
        content: parsed.data.content,
        note_type: parsed.data.note_type || 'technician',
      });

      return reply.status(201).send({ success: true, data: note });
    },
  );
}
