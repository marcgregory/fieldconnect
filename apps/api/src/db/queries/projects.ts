import { query } from '../index';
import type { Project, ProjectStatus } from '@fieldconnect/shared';

export interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ProjectRow): Project {
  return {
    ...row,
    status: row.status as ProjectStatus,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    geofence_radius: row.geofence_radius ?? 50,
  };
}

export async function findAll(filters?: {
  status?: ProjectStatus;
  search?: string;
}): Promise<Project[]> {
  let sql = 'SELECT * FROM projects WHERE 1=1';
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.status) {
    sql += ` AND status = $${paramIndex++}`;
    params.push(filters.status);
  }

  if (filters?.search) {
    sql += ` AND (name ILIKE $${paramIndex} OR address ILIKE $${paramIndex} OR contact_name ILIKE $${paramIndex})`;
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  sql += ' ORDER BY created_at DESC';

  const result = await query(sql, params);
  return result.rows.map(mapRow);
}

export async function findById(id: string): Promise<Project | null> {
  const result = await query('SELECT * FROM projects WHERE id = $1', [id]);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function create(data: {
  name: string;
  description?: string | null;
  address?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius?: number;
  created_by: string;
}): Promise<Project> {
  const result = await query(
    `INSERT INTO projects (name, description, address, contact_name, contact_phone, notes, latitude, longitude, geofence_radius, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      data.name,
      data.description ?? null,
      data.address ?? null,
      data.contact_name ?? null,
      data.contact_phone ?? null,
      data.notes ?? null,
      data.latitude ?? null,
      data.longitude ?? null,
      data.geofence_radius ?? 50,
      data.created_by,
    ],
  );
  return mapRow(result.rows[0]);
}

export async function update(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    address?: string | null;
    contact_name?: string | null;
    contact_phone?: string | null;
    notes?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    geofence_radius?: number;
  },
): Promise<Project | null> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    params.push(data.name);
  }
  if (data.description !== undefined) {
    fields.push(`description = $${paramIndex++}`);
    params.push(data.description);
  }
  if (data.address !== undefined) {
    fields.push(`address = $${paramIndex++}`);
    params.push(data.address);
  }
  if (data.contact_name !== undefined) {
    fields.push(`contact_name = $${paramIndex++}`);
    params.push(data.contact_name);
  }
  if (data.contact_phone !== undefined) {
    fields.push(`contact_phone = $${paramIndex++}`);
    params.push(data.contact_phone);
  }
  if (data.notes !== undefined) {
    fields.push(`notes = $${paramIndex++}`);
    params.push(data.notes);
  }
  if (data.latitude !== undefined) {
    fields.push(`latitude = $${paramIndex++}`);
    params.push(data.latitude);
  }
  if (data.longitude !== undefined) {
    fields.push(`longitude = $${paramIndex++}`);
    params.push(data.longitude);
  }
  if (data.geofence_radius !== undefined) {
    fields.push(`geofence_radius = $${paramIndex++}`);
    params.push(data.geofence_radius);
  }

  if (fields.length === 0) {
    return findById(id);
  }

  fields.push(`updated_at = NOW()`);
  params.push(id);

  const result = await query(
    `UPDATE projects SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params,
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function updateStatus(
  id: string,
  status: ProjectStatus,
): Promise<Project | null> {
  const result = await query(
    `UPDATE projects SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [status, id],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}
