import type { FastifyInstance } from 'fastify';
import {
  createJobAttachmentSchema,
  type AttachmentType,
} from '@fieldconnect/shared';
import { requireRole } from '../../middleware/auth';
import * as jobAttachmentQueries from '../../db/queries/job-attachments';
import * as scheduleQueries from '../../db/queries/schedules';
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
      const { attachmentId } = request.params as { attachmentId: string };

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

      // Delete from disk
      await deleteUpload(attachment.file_path);

      // Delete from database
      await jobAttachmentQueries.deleteById(attachmentId);

      return { success: true, data: { deleted: true } };
    },
  );
}
