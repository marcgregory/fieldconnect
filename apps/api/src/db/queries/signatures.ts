import { query } from '../index';
import type { Signature } from '@fieldconnect/shared';

export async function findBySchedule(scheduleId: string): Promise<Signature[]> {
  const result = await query(
    `SELECT s.*, u.name AS user_name
     FROM signatures s
     JOIN users u ON u.id = s.user_id
     WHERE s.schedule_id = $1
     ORDER BY s.created_at DESC`,
    [scheduleId],
  );
  return result.rows;
}

export async function create(data: {
  schedule_id: string;
  user_id: string;
  signature_data: string;
  label: string;
  cloudinary_public_id?: string;
  secure_url?: string;
  rework_version?: number;
}): Promise<Signature> {
  const result = await query(
    `INSERT INTO signatures (schedule_id, user_id, signature_data, label, cloudinary_public_id, secure_url, rework_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      data.schedule_id,
      data.user_id,
      data.signature_data,
      data.label,
      data.cloudinary_public_id || null,
      data.secure_url || null,
      data.rework_version ?? 0,
    ],
  );
  return result.rows[0];
}
