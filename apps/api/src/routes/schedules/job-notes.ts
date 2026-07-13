import type { FastifyInstance } from 'fastify';
import {
  createJobNoteSchema,
  type CreateJobNoteInput,
} from '@fieldconnect/shared';
import { requireRole } from '../../middleware/auth';
import * as jobNoteQueries from '../../db/queries/job-notes';
import * as scheduleQueries from '../../db/queries/schedules';
import { broadcastNoteEvent } from '../../websocket';
import { insertActivityEvent } from '../../db/queries/activity-events';
import { getEvidenceReworkVersion } from './evidence-version';

export async function jobNoteRoutes(app: FastifyInstance) {
  // ─── List Notes ──────────────────────────────────────────────────────────
  app.get('/api/v1/schedules/:id/notes', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const { id } = request.params as { id: string };
    const queryParams = request.query as { rework_version?: string; technician_id?: string };
    const technicianId = request.user!.role === 'field_technician'
      ? (queryParams.technician_id || request.user!.id)
      : queryParams.technician_id;
    const notes = await jobNoteQueries.findBySchedule(id, technicianId);
    return { success: true, data: notes };
  });

  // ─── Add Note ───────────────────────────────────────────────────────────
  app.post(
    '/api/v1/schedules/:id/notes',
    { preHandler: [requireRole('field_technician', 'admin', 'office_manager', 'dispatcher')] },
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
        !(schedule.technician_ids || []).includes(request.user!.id)
      ) {
        return reply.status(403).send({
          success: false,
          error: 'You can only add notes to your own jobs',
        });
      }

      // Internal notes restricted to admin / office_manager / dispatcher
      if (
        parsed.data.note_type === 'internal' &&
        !['admin', 'office_manager', 'dispatcher'].includes(request.user!.role)
      ) {
        return reply.status(403).send({
          success: false,
          error: 'Only office staff can add internal notes',
        });
      }

      // When an office staff adds an internal note to a specific technician
      // review card, honor the provided technician_id. Otherwise use the
      // requesting user's ID for field_technician or null for office bulk notes.
      const body = request.body as Record<string, unknown>;
      const bodyTechId = body.technician_id as string | undefined;
      const evidenceTechId = bodyTechId || (request.user!.role === 'field_technician' ? request.user!.id : null);
      const reworkVersion =
        parsed.data.note_type === 'internal'
          ? 0
          : getEvidenceReworkVersion(schedule, evidenceTechId);

      const note = await jobNoteQueries.create({
        schedule_id: id,
        user_id: request.user!.id,
        technician_id: evidenceTechId,
        content: parsed.data.content,
        note_type: parsed.data.note_type || 'technician',
        rework_version: reworkVersion,
      });

      // Determine the target technician for this note
      const noteType = parsed.data.note_type || 'technician';
      const targetTechnicianId = noteType === 'internal' ? (bodyTechId || null) : request.user!.id;
      const targetTechnicianName = noteType === 'internal'
        ? (body.technician_name as string) || null
        : request.user!.name;

      // Broadcast note event
      broadcastNoteEvent({
        type: 'note_added',
        schedule_id: id,
        project_name: schedule.project_name,
        user_name: request.user!.name,
        note_type: noteType,
        timestamp: new Date().toISOString(),
        technician_id: targetTechnicianId || request.user!.id,
        technician_name: targetTechnicianName || request.user!.name,
      });

      // Persist to activity feed with structured metadata
      const noteMessage = noteType === 'internal'
        ? `Internal note added — ${schedule.project_name}`
        : `Technician note added — ${schedule.project_name}`;
      const noteMetadata: Record<string, unknown> = {
        schedule_id: id,
        project_name: schedule.project_name,
        note_type: noteType,
        technician_id: targetTechnicianId,
        technician_name: targetTechnicianName,
        actor_id: request.user!.id,
        actor_name: request.user!.name,
      };
      await insertActivityEvent({
        event_type: 'note_added',
        schedule_id: id,
        project_id: schedule.project_id,
        technician_id: targetTechnicianId,
        actor_id: request.user!.id,
        message: noteMessage,
        metadata: noteMetadata,
      });

      return reply.status(201).send({ success: true, data: note });
    },
  );
}
