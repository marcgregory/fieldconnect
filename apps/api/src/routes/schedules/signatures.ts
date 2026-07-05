import type { FastifyInstance } from 'fastify';
import { createSignatureSchema } from '@fieldconnect/shared';
import { requireRole } from '../../middleware/auth';
import * as signatureQueries from '../../db/queries/signatures';
import * as scheduleQueries from '../../db/queries/schedules';
import { broadcastSignatureEvent } from '../../websocket';

export async function signatureRoutes(app: FastifyInstance) {
  // ─── List Signatures ────────────────────────────────────────────────────
  app.get('/api/v1/schedules/:id/signatures', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const { id } = request.params as { id: string };
    const signatures = await signatureQueries.findBySchedule(id);
    return { success: true, data: signatures };
  });

  // ─── Add Signature ──────────────────────────────────────────────────────
  app.post(
    '/api/v1/schedules/:id/signatures',
    { preHandler: [requireRole('field_technician', 'admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = createSignatureSchema.safeParse(request.body);

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

      // Field technicians can only add signatures to their own jobs
      if (
        request.user!.role === 'field_technician' &&
        schedule.technician_id !== request.user!.id
      ) {
        return reply.status(403).send({
          success: false,
          error: 'You can only add signatures to your own jobs',
        });
      }

      const signature = await signatureQueries.create({
        schedule_id: id,
        user_id: request.user!.id,
        signature_data: parsed.data.signature_data,
        label: parsed.data.label || 'customer',
      });

      // Broadcast signature captured event
      broadcastSignatureEvent({
        type: 'signature_captured',
        schedule_id: id,
        project_name: schedule.project_name,
        user_name: request.user!.name,
        label: parsed.data.label || 'customer',
        timestamp: new Date().toISOString(),
        technician_id: schedule.technician_id,
      });

      return reply.status(201).send({ success: true, data: signature });
    },
  );
}
