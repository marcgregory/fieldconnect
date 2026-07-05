import { query } from '../index';

export interface AssignmentRow {
  id: string;
  project_id: string;
  user_id: string;
  assigned_at: string;
}

export interface AssignmentWithDetails {
  id: string;
  project_id: string;
  user_id: string;
  assigned_at: string;
  project_name: string;
  technician_name: string;
  technician_role: string;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function assign(
  projectId: string,
  userId: string,
): Promise<AssignmentRow> {
  const result = await query(
    `INSERT INTO technician_assignments (project_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (project_id, user_id) DO NOTHING
     RETURNING *`,
    [projectId, userId],
  );
  return result.rows[0] || null;
}

export async function unassign(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const result = await query(
    `DELETE FROM technician_assignments WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function findAssignmentsByProject(
  projectId: string,
): Promise<AssignmentWithDetails[]> {
  const result = await query(
    `SELECT ta.*, p.name AS project_name, u.name AS technician_name, u.role AS technician_role
     FROM technician_assignments ta
     JOIN projects p ON p.id = ta.project_id
     JOIN users u ON u.id = ta.user_id
     WHERE ta.project_id = $1
     ORDER BY u.name`,
    [projectId],
  );
  return result.rows;
}

export async function findAssignmentsByUser(
  userId: string,
): Promise<AssignmentWithDetails[]> {
  const result = await query(
    `SELECT ta.*, p.name AS project_name, p.status AS project_status, u.name AS technician_name, u.role AS technician_role
     FROM technician_assignments ta
     JOIN projects p ON p.id = ta.project_id
     JOIN users u ON u.id = ta.user_id
     WHERE ta.user_id = $1
     ORDER BY p.name`,
    [userId],
  );
  return result.rows;
}

/**
 * Return user_ids of all technicians assigned to a project team.
 * Used by schedule routes to validate team membership.
 */
export async function findProjectTeamIds(projectId: string): Promise<string[]> {
  const result = await query(
    `SELECT user_id FROM technician_assignments WHERE project_id = $1`,
    [projectId],
  );
  return result.rows.map((r: { user_id: string }) => r.user_id);
}

export async function findAvailableTechnicians(): Promise<UserRow[]> {
  const result = await query(
    `SELECT id, email, name, role FROM users WHERE role = 'field_technician' ORDER BY name`,
  );
  return result.rows;
}
