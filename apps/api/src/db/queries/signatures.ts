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
}): Promise<Signature> {
  const result = await query(
    `INSERT INTO signatures (schedule_id, user_id, signature_data, label)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.schedule_id, data.user_id, data.signature_data, data.label],
  );
  return result.rows[0];
}
