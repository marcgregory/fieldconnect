import { query, pool } from '../index';
import type { Schedule, ScheduleWithDetails, JobStatus, AuditLog } from '@fieldconnect/shared';

export class ValidationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = statusCode;
  }
}

// ─── Status Transition Rules ──────────────────────────────────────────────

const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  scheduled: ['traveling'],
  traveling: ['on_site'],
  on_site: ['completed'],
  completed: ['closed', 'on_site', 'traveling'],
  closed: [],
};

/**
 * Validate that a status transition is allowed based on role and ownership.
 * Throws ValidationError if the transition is not allowed.
 */
export function validateTransition(
  oldStatus: JobStatus,
  newStatus: JobStatus,
  userRole: string,
  scheduleTechnicianId: string,
  userId: string,
): void {
  // Admin can correct any status to any status
  if (userRole === 'admin') return;

  const allowed = VALID_TRANSITIONS[oldStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new ValidationError(
      `Cannot transition from '${oldStatus}' to '${newStatus}'`,
    );
  }

  // field_technician can only advance their own jobs
  if (userRole === 'field_technician') {
    if (scheduleTechnicianId !== userId) {
      throw new ValidationError('You can only update your own jobs', 403);
    }
    const techAllowed: JobStatus[] = ['scheduled', 'traveling', 'on_site'];
    if (!techAllowed.includes(oldStatus)) {
      throw new ValidationError(
        `Technicians can only advance jobs from scheduled, traveling, or on_site`,
        403,
      );
    }
  }

  // office/dispatcher can review completed + request rework
  if (['office_manager', 'dispatcher'].includes(userRole)) {
    const officeAllowed: JobStatus[] = ['completed'];
    if (!officeAllowed.includes(oldStatus)) {
      throw new ValidationError(
        `Office staff can only advance jobs from completed`,
        403,
      );
    }
    // Rework is allowed from completed back to on_site or traveling
    // (already covered by VALID_TRANSITIONS above)
  }
}

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
    SELECT s.id, s.project_id, s.technician_id,
           s.scheduled_date::text AS scheduled_date,
           s.start_time, s.end_time, s.status, s.notes,
           s.created_by, s.created_at, s.updated_at,
           p.name AS project_name, p.address AS project_address, p.contact_name AS project_contact_name, p.contact_phone AS project_contact_phone, u.name AS technician_name
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
    `SELECT s.id, s.project_id, s.technician_id,
            s.scheduled_date::text AS scheduled_date,
            s.start_time, s.end_time, s.status, s.notes,
            s.created_by, s.created_at, s.updated_at,
            p.name AS project_name,
            p.address AS project_address,
            p.contact_name AS project_contact_name,
            p.contact_phone AS project_contact_phone,
            u.name AS technician_name,
            (SELECT COUNT(*)::int FROM job_notes WHERE schedule_id = s.id) AS note_count,
            (SELECT COUNT(*)::int FROM job_attachments WHERE schedule_id = s.id) AS attachment_count,
            (SELECT COUNT(*)::int FROM signatures WHERE schedule_id = s.id) AS signature_count
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
    `SELECT s.id, s.project_id, s.technician_id,
            s.scheduled_date::text AS scheduled_date,
            s.start_time, s.end_time, s.status, s.notes,
            s.created_by, s.created_at, s.updated_at,
            p.name AS project_name, p.address AS project_address, p.contact_name AS project_contact_name, p.contact_phone AS project_contact_phone, u.name AS technician_name
     FROM schedules s
     JOIN projects p ON p.id = s.project_id
     JOIN users u ON u.id = s.technician_id
     WHERE s.scheduled_date >= $1 AND s.scheduled_date <= $2
     ORDER BY s.scheduled_date, s.start_time NULLS LAST`,
    [from, to],
  );
  return result.rows;
}

export async function findForReview(): Promise<ScheduleWithDetails[]> {
  const result = await query(
    `SELECT s.id, s.project_id, s.technician_id,
            s.scheduled_date::text AS scheduled_date,
            s.start_time, s.end_time, s.status, s.notes,
            s.created_by, s.created_at, s.updated_at,
            p.name AS project_name, p.address AS project_address,
            p.contact_name AS project_contact_name, p.contact_phone AS project_contact_phone,
            u.name AS technician_name,
            (SELECT COUNT(*)::int FROM job_notes WHERE schedule_id = s.id) AS note_count,
            (SELECT COUNT(*)::int FROM job_attachments WHERE schedule_id = s.id) AS attachment_count,
            (SELECT COUNT(*)::int FROM signatures WHERE schedule_id = s.id) AS signature_count
     FROM schedules s
     JOIN projects p ON p.id = s.project_id
     JOIN users u ON u.id = s.technician_id
     WHERE s.status = 'completed'
     ORDER BY s.scheduled_date DESC, s.updated_at DESC`,
  );
  return result.rows;
}

export async function findUnassigned(): Promise<ScheduleWithDetails[]> {
  const result = await query(
    `SELECT s.id, s.project_id, s.technician_id,
            s.scheduled_date::text AS scheduled_date,
            s.start_time, s.end_time, s.status, s.notes,
            s.created_by, s.created_at, s.updated_at,
            p.name AS project_name, p.address AS project_address, p.contact_name AS project_contact_name, p.contact_phone AS project_contact_phone, u.name AS technician_name
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
    `SELECT s.id, s.project_id, s.technician_id,
            s.scheduled_date::text AS scheduled_date,
            s.start_time, s.end_time, s.status, s.notes,
            s.created_by, s.created_at, s.updated_at,
            p.name AS project_name, p.address AS project_address, p.contact_name AS project_contact_name, p.contact_phone AS project_contact_phone, u.name AS technician_name
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

// ─── Conflict Detection ────────────────────────────────────────────────────

export interface ConflictInfo {
  id: string;
  project_name: string;
  start_time: string;
  end_time: string;
  conflict_type: 'overlap' | 'buffer';
}

const BUFFER_MINUTES = 30;

/**
 * Find schedule conflicts for a technician on a given date.
 * Conflict rule: existing.start_time < requested.end_time + buffer
 *                AND existing.end_time + buffer > requested.start_time
 *
 * Pass excludeScheduleId when updating an existing schedule to exclude it
 * from the conflict check.
 */
export async function findConflicts(
  technicianId: string,
  scheduledDate: string,
  startTime: string,
  endTime: string,
  excludeScheduleId?: string,
): Promise<ConflictInfo[]> {
  // Convert time strings to minutes-since-midnight for comparison
  const startParts = startTime.split(':').map(Number);
  const endParts = endTime.split(':').map(Number);
  const requestedStart = startParts[0] * 60 + startParts[1];
  const requestedEnd = endParts[0] * 60 + endParts[1];

  // Fetch all schedules for this technician on this date with time slots
  let sql = `
    SELECT s.id, s.start_time, s.end_time, p.name AS project_name
    FROM schedules s
    JOIN projects p ON p.id = s.project_id
    WHERE s.technician_id = $1
      AND s.scheduled_date = $2
      AND s.start_time IS NOT NULL
      AND s.end_time IS NOT NULL
  `;
  const params: unknown[] = [technicianId, scheduledDate];
  let paramIndex = 3;

  if (excludeScheduleId) {
    sql += ` AND s.id != $${paramIndex++}`;
    params.push(excludeScheduleId);
  }

  sql += ' ORDER BY s.start_time';

  const result = await query(sql, params);

  const conflicts: ConflictInfo[] = [];
  for (const row of result.rows) {
    const existingParts = row.start_time.split(':').map(Number);
    const existingEndParts = row.end_time.split(':').map(Number);
    const existingStart = existingParts[0] * 60 + existingParts[1];
    const existingEnd = existingEndParts[0] * 60 + existingEndParts[1];

    // Conflict: existing.start_time < requested.end_time + buffer
    //           AND existing.end_time + buffer > requested.start_time
    const requestedEndWithBuffer = requestedEnd + BUFFER_MINUTES;
    const existingEndWithBuffer = existingEnd + BUFFER_MINUTES;

    if (existingStart < requestedEndWithBuffer && existingEndWithBuffer > requestedStart) {
      // Determine if it's an actual overlap or just a buffer conflict
      const isOverlap = existingStart < requestedEnd && existingEnd > requestedStart;
      conflicts.push({
        id: row.id,
        project_name: row.project_name,
        start_time: row.start_time,
        end_time: row.end_time,
        conflict_type: isOverlap ? 'overlap' : 'buffer',
      });
    }
  }

  return conflicts;
}

/**
 * Build a human-readable conflict error message.
 */
export function formatConflictError(conflicts: ConflictInfo[]): string {
  const details = conflicts.map((c) => {
    const start = c.start_time.slice(0, 5);
    const end = c.end_time.slice(0, 5);
    const reason =
      c.conflict_type === 'overlap'
        ? 'Overlaps with existing job'
        : 'Within 30-minute buffer';
    return `"${c.project_name}" (${start} — ${end}) — ${reason}`;
  });
  return `Technician has schedule conflicts:\n${details.join('\n')}\nMinimum 30-minute buffer required.`;
}

// ─── Status Transition with Transaction ───────────────────────────────────

export interface UpdateStatusResult {
  schedule: ScheduleWithDetails;
  audit: AuditLog;
}

export async function updateStatus(data: {
  id: string;
  status: JobStatus;
  user_id: string;
  user_role: string;
  technician_id: string;
  notes?: string;
}): Promise<UpdateStatusResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Row-level lock on the schedule row
    const lockResult = await client.query(
      'SELECT status, technician_id FROM schedules WHERE id = $1 FOR UPDATE',
      [data.id],
    );

    if (lockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new ValidationError('Schedule not found', 404);
    }

    const oldStatus = lockResult.rows[0].status as JobStatus;

    // Validate the transition
    validateTransition(
      oldStatus,
      data.status,
      data.user_role,
      data.technician_id,
      data.user_id,
    );

    // Update the schedule status
    const updateResult = await client.query(
      `UPDATE schedules SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [data.status, data.id],
    );

    // Insert audit log entry
    const metadata = data.notes ? JSON.stringify({ notes: data.notes }) : null;
    const auditResult = await client.query(
      `INSERT INTO audit_logs (schedule_id, user_id, action, old_status, new_status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.id, data.user_id, 'status_change', oldStatus, data.status, metadata],
    );

    await client.query('COMMIT');

    // Fetch the enriched schedule with project/technician details
    const schedule = await findById(data.id);

    return {
      schedule: schedule!,
      audit: auditResult.rows[0],
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Audit Log Queries ────────────────────────────────────────────────────

export async function findAuditLogsBySchedule(
  scheduleId: string,
): Promise<AuditLog[]> {
  const result = await query(
    `SELECT al.*, u.name AS user_name FROM audit_logs al
     JOIN users u ON u.id = al.user_id
     WHERE al.schedule_id = $1
     ORDER BY al.created_at DESC`,
    [scheduleId],
  );
  return result.rows;
}
