import { query } from '../index';
import type { Schedule, ScheduleWithDetails } from '@fieldconnect/shared';

export interface ScheduleRow {
  id: string;
  project_id: string;
  technician_id: string;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export async function findAll(filters?: {
  date?: string;
  technician_id?: string;
  project_id?: string;
  status?: string;
}): Promise<ScheduleWithDetails[]> {
  let sql = `
    SELECT s.*, p.name AS project_name, p.address AS project_address, p.contact_name AS project_contact_name, p.contact_phone AS project_contact_phone, u.name AS technician_name
    FROM schedules s
    JOIN projects p ON p.id = s.project_id
    JOIN users u ON u.id = s.technician_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.date) {
    sql += ` AND s.scheduled_date = $${paramIndex++}`;
    params.push(filters.date);
  }
  if (filters?.technician_id) {
    sql += ` AND s.technician_id = $${paramIndex++}`;
    params.push(filters.technician_id);
  }
  if (filters?.project_id) {
    sql += ` AND s.project_id = $${paramIndex++}`;
    params.push(filters.project_id);
  }
  if (filters?.status) {
    sql += ` AND s.status = $${paramIndex++}`;
    params.push(filters.status);
  }

  sql += ' ORDER BY s.scheduled_date, s.start_time NULLS LAST';

  const result = await query(sql, params);
  return result.rows;
}

export async function findById(id: string): Promise<ScheduleWithDetails | null> {
  const result = await query(
    `SELECT s.*, p.name AS project_name, p.address AS project_address, p.contact_name AS project_contact_name, p.contact_phone AS project_contact_phone, u.name AS technician_name
     FROM schedules s
     JOIN projects p ON p.id = s.project_id
     JOIN users u ON u.id = s.technician_id
     WHERE s.id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

export async function findByDateRange(from: string, to: string): Promise<ScheduleWithDetails[]> {
  const result = await query(
    `SELECT s.*, p.name AS project_name, p.address AS project_address, p.contact_name AS project_contact_name, p.contact_phone AS project_contact_phone, u.name AS technician_name
     FROM schedules s
     JOIN projects p ON p.id = s.project_id
     JOIN users u ON u.id = s.technician_id
     WHERE s.scheduled_date >= $1 AND s.scheduled_date <= $2
     ORDER BY s.scheduled_date, s.start_time NULLS LAST`,
    [from, to],
  );
  return result.rows;
}

export async function findUnassigned(): Promise<ScheduleWithDetails[]> {
  const result = await query(
    `SELECT s.*, p.name AS project_name, p.address AS project_address, p.contact_name AS project_contact_name, p.contact_phone AS project_contact_phone, u.name AS technician_name
     FROM schedules s
     JOIN projects p ON p.id = s.project_id
     JOIN users u ON u.id = s.technician_id
     WHERE s.status = 'scheduled'
       AND s.start_time IS NULL
     ORDER BY s.scheduled_date`,
  );
  return result.rows;
}

export async function findByTechnician(technicianId: string): Promise<ScheduleWithDetails[]> {
  const result = await query(
    `SELECT s.*, p.name AS project_name, p.address AS project_address, p.contact_name AS project_contact_name, p.contact_phone AS project_contact_phone, u.name AS technician_name
     FROM schedules s
     JOIN projects p ON p.id = s.project_id
     JOIN users u ON u.id = s.technician_id
     WHERE s.technician_id = $1
     ORDER BY s.scheduled_date DESC, s.start_time NULLS LAST`,
    [technicianId],
  );
  return result.rows;
}

export async function create(data: {
  project_id: string;
  technician_id: string;
  scheduled_date: string;
  start_time?: string | null;
  end_time?: string | null;
  notes?: string | null;
  created_by: string;
}): Promise<Schedule> {
  const result = await query(
    `INSERT INTO schedules (project_id, technician_id, scheduled_date, start_time, end_time, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      data.project_id,
      data.technician_id,
      data.scheduled_date,
      data.start_time ?? null,
      data.end_time ?? null,
      data.notes ?? null,
      data.created_by,
    ],
  );
  return result.rows[0];
}

export async function update(
  id: string,
  data: {
    project_id?: string;
    technician_id?: string;
    scheduled_date?: string;
    start_time?: string | null;
    end_time?: string | null;
    notes?: string | null;
  },
): Promise<Schedule | null> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (data.project_id !== undefined) {
    fields.push(`project_id = $${paramIndex++}`);
    params.push(data.project_id);
  }
  if (data.technician_id !== undefined) {
    fields.push(`technician_id = $${paramIndex++}`);
    params.push(data.technician_id);
  }
  if (data.scheduled_date !== undefined) {
    fields.push(`scheduled_date = $${paramIndex++}`);
    params.push(data.scheduled_date);
  }
  if (data.start_time !== undefined) {
    fields.push(`start_time = $${paramIndex++}`);
    params.push(data.start_time);
  }
  if (data.end_time !== undefined) {
    fields.push(`end_time = $${paramIndex++}`);
    params.push(data.end_time);
  }
  if (data.notes !== undefined) {
    fields.push(`notes = $${paramIndex++}`);
    params.push(data.notes);
  }

  if (fields.length === 0) {
    return findById(id);
  }

  fields.push('updated_at = NOW()');
  params.push(id);

  const result = await query(
    `UPDATE schedules SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params,
  );
  return result.rows[0] || null;
}

export async function deleteById(id: string): Promise<boolean> {
  const result = await query('DELETE FROM schedules WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
