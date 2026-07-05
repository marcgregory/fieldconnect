import type { FastifyInstance } from 'fastify';
import {
  createJobAttachmentSchema,
  type AttachmentType,
} from '@fieldconnect/shared';
import { requireRole } from '../../middleware/auth';
import * as jobAttachmentQueries from '../../db/queries/job-attachments';
import * as scheduleQueries from '../../db/queries/schedules';
import { broadcastAttachmentEvent } from '../../websocket';
import { saveUpload, deleteUpload } from '../../lib/file-storage';

const MAX_ATTACHMENTS = 20;

export async function jobAttachmentRoutes(app: FastifyInstance) {
  // ─── List Attachments ────────────────────────────────────────────────────
  app.get('/api/v1/schedules/:id/attachments', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const { id } = request.params as { id: string };
    const attachments = await jobAttachmentQueries.findBySchedule(id);
    return { success: true, data: attachments };
  });

  // ─── Upload Attachment ───────────────────────────────────────────────────
  app.post(
    '/api/v1/schedules/:id/attachments',
    { preHandler: [requireRole('field_technician', 'admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Verify schedule exists
      const schedule = await scheduleQueries.findById(id);
      if (!schedule) {
        return reply.status(404).send({ success: false, error: 'Schedule not found' });
      }

      // Field technicians can only upload to their own jobs
      if (
        request.user!.role === 'field_technician' &&
        schedule.technician_id !== request.user!.id
      ) {
        return reply.status(403).send({
          success: false, error: 'You can only upload to your own jobs',
        });
      }

      // Check max attachments limit
      const currentCount = await jobAttachmentQueries.countBySchedule(id);
      if (currentCount >= MAX_ATTACHMENTS) {
        return reply.status(400).send({
          success: false,
          error: `Maximum of ${MAX_ATTACHMENTS} attachments per job`,
        });
      }

      // Process multipart upload
      const fileData = await request.file();
      if (!fileData) {
        return reply.status(400).send({
          success: false,
          error: 'File is required',
        });
      }

      // Read attachment_type from fields
      const fields = fileData.fields as Record<string, any>;
      const attachmentType = fields?.attachment_type?.value || 'document';

      // Validate attachment type
      const typeCheck = createJobAttachmentSchema.safeParse({
        attachment_type: attachmentType,
      });
      if (!typeCheck.success) {
        return reply.status(400).send({
          success: false,
          error: typeCheck.error.errors[0].message,
        });
      }

      // Read the file buffer
      const buffer = await fileData.toBuffer();
      const fileName = fileData.filename || 'upload.bin';
      const mimeType = fileData.mimetype || 'application/octet-stream';
      const fileSize = buffer.length;

      // Save to disk
      const relativePath = await saveUpload(id, fileName, buffer);

      try {
        const attachment = await jobAttachmentQueries.create({
          schedule_id: id,
          user_id: request.user!.id,
          file_name: fileName,
          file_path: relativePath,
          mime_type: mimeType,
          file_size: fileSize,
          attachment_type: typeCheck.data.attachment_type,
        });

        // Broadcast attachment uploaded event
        broadcastAttachmentEvent({
          type: 'attachment_uploaded',
          schedule_id: id,
          project_name: schedule.project_name,
          user_name: request.user!.name,
          attachment_id: attachment.id,
          file_name: fileName,
          attachment_type: typeCheck.data.attachment_type,
          timestamp: new Date().toISOString(),
          technician_id: schedule.technician_id,
        });

        return reply.status(201).send({ success: true, data: attachment });
      } catch (err) {
        // Rollback file if DB insert fails
        await deleteUpload(relativePath);
        throw err;
      }
    },
  );

  // ─── Delete Attachment ────────────────────────────────────────────────────
  app.delete(
    '/api/v1/schedules/:id/attachments/:attachmentId',
    { preHandler: [requireRole('field_technician', 'admin')] },
    async (request, reply) => {
      const { id, attachmentId } = request.params as { id: string; attachmentId: string };

      // Find attachment for ownership check
      const attachment = await jobAttachmentQueries.findById(attachmentId);
      if (!attachment) {
        return reply.status(404).send({ success: false, error: 'Attachment not found' });
      }

      // Field technicians can only delete their own attachments
      if (
        request.user!.role === 'field_technician' &&
        attachment.user_id !== request.user!.id
      ) {
        return reply.status(403).send({
          success: false,
          error: 'You can only delete your own attachments',
        });
      }

      // Get schedule for technician_id before deletion
      const schedule = await scheduleQueries.findById(id).catch(() => null);

      // Delete from disk
      await deleteUpload(attachment.file_path);

      // Delete from database
      await jobAttachmentQueries.deleteById(attachmentId);

      // Broadcast attachment deleted event
      if (schedule) {
        broadcastAttachmentEvent({
          type: 'attachment_deleted',
          schedule_id: id,
          project_name: schedule.project_name,
          user_name: request.user!.name,
          attachment_id: attachmentId,
          file_name: attachment.file_name,
          attachment_type: attachment.attachment_type,
          timestamp: new Date().toISOString(),
          technician_id: schedule.technician_id,
        });
      }

      return { success: true, data: { deleted: true } };
    },
  );
}
