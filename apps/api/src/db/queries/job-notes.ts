import { query } from '../index';
import type { JobNote } from '@fieldconnect/shared';

export async function findBySchedule(scheduleId: string, technicianId?: string): Promise<JobNote[]> {
  let sql = `SELECT jn.*, u.name AS user_name
     FROM job_notes jn
     JOIN users u ON u.id = jn.user_id
     WHERE jn.schedule_id = $1`;
  const params: unknown[] = [scheduleId];
  if (technicianId) {
    params.push(technicianId);
    sql += ` AND (jn.technician_id = $2 OR jn.technician_id IS NULL)`;
  }
  sql += ` ORDER BY jn.created_at DESC`;
  const result = await query(sql, params);
  return result.rows;
}

export async function create(data: {
  schedule_id: string;
  user_id: string;
  content: string;
  note_type: string;
  rework_version?: number;
  technician_id?: string | null;
}): Promise<JobNote> {
  const result = await query(
    `INSERT INTO job_notes (schedule_id, user_id, content, note_type, rework_version, technician_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [data.schedule_id, data.user_id, data.content, data.note_type, data.rework_version ?? 0, data.technician_id ?? null],
  );
  return result.rows[0];
}

export async function findByScheduleWithCounts(
  scheduleId: string,
): Promise<{ note_count: number; attachment_count: number; signature_count: number }> {
  const result = await query(
    `SELECT
       (SELECT COUNT(*) FROM job_notes WHERE schedule_id = $1)::int AS note_count,
       (SELECT COUNT(*) FROM job_attachments WHERE schedule_id = $1)::int AS attachment_count,
       (SELECT COUNT(*) FROM signatures WHERE schedule_id = $1)::int AS signature_count`,
    [scheduleId],
  );
  return result.rows[0];
}
