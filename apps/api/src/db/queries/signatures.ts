import { query } from '../index';
import type { Signature } from '@fieldconnect/shared';

export async function findBySchedule(scheduleId: string, technicianId?: string): Promise<Signature[]> {
  let sql = `SELECT s.*, u.name AS user_name
     FROM signatures s
     JOIN users u ON u.id = s.user_id
     WHERE s.schedule_id = $1`;
  const params: unknown[] = [scheduleId];
  if (technicianId) {
    params.push(technicianId);
    sql += ` AND (s.technician_id = $2 OR s.technician_id IS NULL)`;
  }
  sql += ` ORDER BY s.created_at DESC`;
  const result = await query(sql, params);
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
  technician_id?: string | null;
}): Promise<Signature> {
  const result = await query(
    `INSERT INTO signatures (schedule_id, user_id, signature_data, label, cloudinary_public_id, secure_url, rework_version, technician_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.schedule_id,
      data.user_id,
      data.signature_data,
      data.label,
      data.cloudinary_public_id || null,
      data.secure_url || null,
      data.rework_version ?? 0,
      data.technician_id ?? null,
    ],
  );
  return result.rows[0];
}
