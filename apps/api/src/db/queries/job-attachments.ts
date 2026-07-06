import { query } from '../index';
import type { JobAttachment } from '@fieldconnect/shared';

export async function findBySchedule(scheduleId: string): Promise<JobAttachment[]> {
  const result = await query(
    `SELECT ja.*, u.name AS user_name
     FROM job_attachments ja
     JOIN users u ON u.id = ja.user_id
     WHERE ja.schedule_id = $1
     ORDER BY ja.created_at DESC`,
    [scheduleId],
  );
  return result.rows;
}

export async function findById(id: string): Promise<JobAttachment | null> {
  const result = await query(
    `SELECT ja.*, u.name AS user_name
     FROM job_attachments ja
     JOIN users u ON u.id = ja.user_id
     WHERE ja.id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

export async function create(data: {
  schedule_id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  attachment_type: string;
  cloudinary_public_id?: string;
  secure_url?: string;
  resource_type?: string;
  /** GPS + geofence evidence fields */
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  captured_at?: string | null;
  distance_from_site?: number | null;
  inside_geofence?: boolean | null;
  /** Cloudinary image dimensions */
  width?: number | null;
  height?: number | null;
  format?: string | null;
}): Promise<JobAttachment> {
  const result = await query(
    `INSERT INTO job_attachments
      (schedule_id, user_id, file_name, file_path, mime_type, file_size, attachment_type,
       cloudinary_public_id, secure_url, resource_type,
       latitude, longitude, accuracy, captured_at, distance_from_site, inside_geofence,
       width, height, format)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     RETURNING *`,
    [
      data.schedule_id,
      data.user_id,
      data.file_name,
      data.file_path,
      data.mime_type,
      data.file_size,
      data.attachment_type,
      data.cloudinary_public_id || null,
      data.secure_url || null,
      data.resource_type || null,
      data.latitude ?? null,
      data.longitude ?? null,
      data.accuracy ?? null,
      data.captured_at ?? null,
      data.distance_from_site ?? null,
      data.inside_geofence ?? null,
      data.width ?? null,
      data.height ?? null,
      data.format ?? null,
    ],
  );
  return result.rows[0];
}

export async function deleteById(id: string): Promise<JobAttachment | null> {
  const result = await query(
    `DELETE FROM job_attachments WHERE id = $1 RETURNING *`,
    [id],
  );
  return result.rows[0] || null;
}

export async function countBySchedule(scheduleId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM job_attachments WHERE schedule_id = $1`,
    [scheduleId],
  );
  return result.rows[0].count;
}
