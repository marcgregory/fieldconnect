import { query } from '../index';
import type { ActiveTimeEntry, TimeEntry, TimeEntryWithProject } from '@fieldconnect/shared';

export interface TimeEntryRow {
  id: string;
  user_id: string;
  project_id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  notes: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: TimeEntryRow): TimeEntry {
  return {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id,
    clock_in: row.clock_in,
    clock_out: row.clock_out,
    break_minutes: row.break_minutes,
    notes: row.notes,
    clock_in_lat: row.clock_in_lat ?? null,
    clock_in_lng: row.clock_in_lng ?? null,
    clock_out_lat: row.clock_out_lat ?? null,
    clock_out_lng: row.clock_out_lng ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function clockIn(
  userId: string,
  projectId: string,
  notes?: string | null,
  clockInLat?: number | null,
  clockInLng?: number | null,
): Promise<TimeEntry> {
  const result = await query(
    `INSERT INTO time_entries (user_id, project_id, notes, clock_in_lat, clock_in_lng)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, projectId, notes ?? null, clockInLat ?? null, clockInLng ?? null],
  );
  return mapRow(result.rows[0]);
}

export async function clockOut(
  id: string,
  notes?: string | null,
  clockOutLat?: number | null,
  clockOutLng?: number | null,
): Promise<TimeEntry | null> {
  let sql = `UPDATE time_entries SET clock_out = NOW(), updated_at = NOW()`;
  const params: unknown[] = [];
  let paramIndex = 1;

  if (notes !== undefined) {
    sql += `, notes = $${paramIndex++}`;
    params.push(notes);
  }

  if (clockOutLat !== undefined && clockOutLat !== null) {
    sql += `, clock_out_lat = $${paramIndex++}`;
    params.push(clockOutLat);
  }

  if (clockOutLng !== undefined && clockOutLng !== null) {
    sql += `, clock_out_lng = $${paramIndex++}`;
    params.push(clockOutLng);
  }

  sql += ` WHERE id = $${paramIndex} AND clock_out IS NULL RETURNING *`;
  params.push(id);

  const result = await query(sql, params);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function findActiveByUser(userId: string): Promise<ActiveTimeEntry | null> {
  const result = await query(
    `SELECT te.*, p.name AS project_name, p.address AS project_address
     FROM time_entries te
     JOIN projects p ON p.id = te.project_id
     WHERE te.user_id = $1 AND te.clock_out IS NULL
     ORDER BY te.clock_in DESC
     LIMIT 1`,
    [userId],
  );
  return result.rows[0] || null;
}

export async function findActiveAll(): Promise<(ActiveTimeEntry & { user_name: string })[]> {
  const result = await query(
    `SELECT te.*, p.name AS project_name, p.address AS project_address, u.name AS user_name
     FROM time_entries te
     JOIN projects p ON p.id = te.project_id
     JOIN users u ON u.id = te.user_id
     WHERE te.clock_out IS NULL
     ORDER BY te.clock_in DESC`,
  );
  return result.rows;
}

export async function findByUser(
  userId: string,
  filters?: {
    from?: string;
    to?: string;
    project_id?: string;
  },
): Promise<TimeEntryWithProject[]> {
  let sql = `SELECT te.*, p.name AS project_name
             FROM time_entries te
             JOIN projects p ON p.id = te.project_id
             WHERE te.user_id = $1`;
  const params: unknown[] = [userId];
  let paramIndex = 2;

  if (filters?.from) {
    sql += ` AND te.clock_in >= $${paramIndex++}`;
    params.push(filters.from);
  }
  if (filters?.to) {
    sql += ` AND te.clock_in <= $${paramIndex++}`;
    params.push(filters.to);
  }
  if (filters?.project_id) {
    sql += ` AND te.project_id = $${paramIndex++}`;
    params.push(filters.project_id);
  }

  sql += ' ORDER BY te.clock_in DESC';

  const result = await query(sql, params);
  return result.rows;
}
