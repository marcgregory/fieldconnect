import type { FastifyInstance } from 'fastify';
import {
  createJobAttachmentSchema,
  calculateDistance,
  evaluateGeofence,
  type AttachmentType,
  type GeofenceStatus,
} from '@fieldconnect/shared';
import { requireRole } from '../../middleware/auth';
import * as jobAttachmentQueries from '../../db/queries/job-attachments';
import * as scheduleQueries from '../../db/queries/schedules';
import * as reworkQueries from '../../db/queries/rework';
import { broadcastAttachmentEvent } from '../../websocket';
import { insertActivityEvent } from '../../db/queries/activity-events';
import { saveUpload, deleteUpload } from '../../lib/file-storage';
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from '../../lib/cloudinary-storage';
import {
  validateFileUpload,
  checkUploadRateLimit,
  validateImageDimensions,
} from '../../lib/file-validation';

const MAX_ATTACHMENTS = 20;

export async function jobAttachmentRoutes(app: FastifyInstance) {
  // ─── List Attachments ────────────────────────────────────────────────────
  app.get('/api/v1/schedules/:id/attachments', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const { id } = request.params as { id: string };
    const queryParams = request.query as { technician_id?: string };
    const technicianId = request.user!.role === 'field_technician'
      ? (queryParams.technician_id || request.user!.id)
      : queryParams.technician_id;
    const attachments = await jobAttachmentQueries.findBySchedule(id, technicianId);
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
        !(schedule.technician_ids || []).includes(request.user!.id)
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

      // Read attachment_type and GPS data from query (BFF proxy) or multipart fields (offline sync)
      const query = request.query as {
        attachment_type?: string;
        lat?: string; lng?: string; accuracy?: string; captured_at?: string;
      };
      const fields = fileData.fields as Record<string, any>;
      const attachmentType = query.attachment_type || fields?.attachment_type?.value || 'document';

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

      // Parse GPS data from query params or multipart fields
      const photoLat = parseFloat(query.lat ?? fields?.lat?.value) || undefined;
      const photoLng = parseFloat(query.lng ?? fields?.lng?.value) || undefined;
      const photoAccuracy = parseFloat(query.accuracy ?? fields?.accuracy?.value) || undefined;
      const capturedAt = query.captured_at ?? fields?.captured_at?.value ?? undefined;

      // Compute geofence status immediately if we have photo GPS + project coords
      let distanceFromSite: number | null = null;
      let insideGeofence: boolean | null = null;
      if (photoLat && photoLng && schedule.project_latitude && schedule.project_longitude) {
        const dist = calculateDistance(
          photoLat, photoLng,
          schedule.project_latitude, schedule.project_longitude,
        );
        distanceFromSite = dist !== null ? Math.round(dist) : null;
        const gfStatus = evaluateGeofence(
          dist,
          schedule.project_geofence_radius ?? 50,
        );
        insideGeofence = gfStatus === 'inside' ? true : false;
      }

      // Read the file buffer
      const buffer = await fileData.toBuffer();
      const fileName = fileData.filename || 'upload.bin';
      const mimeType = fileData.mimetype || 'application/octet-stream';
      const fileSize = buffer.length;

      // ── Server-side file validation ──────────────────────────────────────────
      const validationResult = validateFileUpload(buffer, mimeType, fileName);
      if (!validationResult.valid) {
        return reply.status(400).send({
          success: false,
          error: validationResult.error,
        });
      }
      const safeFileName = validationResult.sanitizedFilename!;

      // ── Upload rate limiting ─────────────────────────────────────────────────
      const rateCheck = checkUploadRateLimit(request.user!.id);
      if (!rateCheck.allowed) {
        return reply.status(429).send({
          success: false,
          error: `Too many uploads. Try again in ${rateCheck.retryAfter} seconds.`,
          retryAfter: rateCheck.retryAfter,
        });
      }

      // Upload to Cloudinary
      let cloudinaryResult: {
        public_id: string;
        secure_url: string;
        resource_type: string;
        file_size: number;
        width: number;
        height: number;
        format: string;
      } | null = null;
      let relativePath = '';

      try {
        cloudinaryResult = await uploadToCloudinary(id, buffer, safeFileName, mimeType);
        relativePath = `${id}/${cloudinaryResult.public_id}`; // logical path for records

        // Validate image dimensions if Cloudinary returned them
        if (mimeType.startsWith('image/')) {
          const dimResult = validateImageDimensions(
            cloudinaryResult.width,
            cloudinaryResult.height,
          );
          if (!dimResult.valid) {
            // Rollback the upload
            await deleteFromCloudinary(cloudinaryResult.public_id).catch(() => {});
            return reply.status(400).send({
              success: false,
              error: dimResult.error,
            });
          }
        }
      } catch (cloudinaryErr) {
        // Fallback: save to local disk if Cloudinary fails
        console.warn('Cloudinary upload failed, falling back to local storage:', cloudinaryErr);
        relativePath = await saveUpload(id, safeFileName, buffer);
      }

      try {
        // Determine rework_version: if there's an open rework, use the next version
        let reworkVersion = 0;
        if (schedule.status === 'on_site') {
          const hasOpen = await reworkQueries.hasOpenRework(id);
          if (hasOpen) {
            reworkVersion = await reworkQueries.getNextReworkVersion(id);
          }
        }

        const attachment = await jobAttachmentQueries.create({
          schedule_id: id,
          user_id: request.user!.id,
          technician_id: request.user!.id,
          file_name: safeFileName,
          file_path: relativePath,
          mime_type: mimeType,
          file_size: cloudinaryResult?.file_size || fileSize,
          attachment_type: typeCheck.data.attachment_type,
          cloudinary_public_id: cloudinaryResult?.public_id,
          secure_url: cloudinaryResult?.secure_url,
          resource_type: cloudinaryResult?.resource_type,
          // GPS evidence data
          latitude: photoLat ?? null,
          longitude: photoLng ?? null,
          accuracy: photoAccuracy ?? null,
          captured_at: capturedAt ?? null,
          distance_from_site: distanceFromSite,
          inside_geofence: insideGeofence,
          // Cloudinary image dimensions
          width: cloudinaryResult?.width ?? null,
          height: cloudinaryResult?.height ?? null,
          format: cloudinaryResult?.format ?? null,
          rework_version: reworkVersion,
        });

        // Broadcast attachment uploaded event
        broadcastAttachmentEvent({
          type: 'attachment_uploaded',
          schedule_id: id,
          project_name: schedule.project_name,
          user_name: request.user!.name,
          attachment_id: attachment.id,
          file_name: safeFileName,
          attachment_type: typeCheck.data.attachment_type,
          timestamp: new Date().toISOString(),
          technician_id: request.user!.id,
        });

        // Persist to activity feed with structured metadata
        const attType = typeCheck.data.attachment_type;
        const typeLabels: Record<string, string> = {
          before: 'Before photo',
          during: 'During photo',
          after: 'After photo',
          document: 'Document',
        };
        const typeLabel = typeLabels[attType] || 'Photo';
        await insertActivityEvent({
          event_type: 'photo_uploaded',
          schedule_id: id,
          project_id: schedule.project_id,
          technician_id: request.user!.id,
          actor_id: request.user!.id,
          message: `${typeLabel} added — ${schedule.project_name}`,
          metadata: {
            schedule_id: id,
            project_name: schedule.project_name,
            attachment_id: attachment.id,
            attachment_type: attType,
            event_type: 'photo_uploaded',
            technician_id: request.user!.id,
            technician_name: request.user!.name,
            actor_id: request.user!.id,
            actor_name: request.user!.name,
          },
        });

        return reply.status(201).send({ success: true, data: attachment });
      } catch (err) {
        // Rollback file if DB insert fails
        if (cloudinaryResult?.public_id) {
          await deleteFromCloudinary(cloudinaryResult.public_id).catch(() => {});
        } else {
          await deleteUpload(relativePath);
        }
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

      // Delete from Cloudinary first (if cloudinary upload)
      if (attachment.cloudinary_public_id) {
        await deleteFromCloudinary(attachment.cloudinary_public_id);
      }

      // Delete from disk (local fallback)
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
          technician_id: request.user!.id,
        });

        // Persist to activity feed with structured metadata
        const delAttType = attachment.attachment_type;
        const delTypeLabels: Record<string, string> = {
          before: 'Before photo',
          during: 'During photo',
          after: 'After photo',
          document: 'Document',
        };
        const delTypeLabel = delTypeLabels[delAttType] || 'Photo';
        await insertActivityEvent({
          event_type: 'photo_deleted',
          schedule_id: id,
          project_id: schedule.project_id,
          technician_id: attachment.technician_id || request.user!.id,
          actor_id: request.user!.id,
          message: `${delTypeLabel} removed — ${schedule.project_name}`,
          metadata: {
            schedule_id: id,
            project_name: schedule.project_name,
            attachment_id: attachmentId,
            attachment_type: delAttType,
            event_type: 'photo_deleted',
            technician_id: attachment.technician_id || request.user!.id,
            technician_name: request.user!.name,
            actor_id: request.user!.id,
            actor_name: request.user!.name,
          },
        });
      }

      return { success: true, data: { deleted: true } };
    },
  );
}
