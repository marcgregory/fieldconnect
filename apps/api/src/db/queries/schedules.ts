import { query, pool } from '../index';
import type { Schedule, ScheduleWithDetails, JobStatus, AuditLog, TechnicianWorkflowStatus } from '@fieldconnect/shared';

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
  completed: ['closed', 'on_site', 'traveling', 'rework_required'],
  closed: [],
  rework_required: ['on_site', 'completed', 'closed'],
};

/**
 * Validate that a status transition is allowed based on role, targeting a
 * specific technician's per-tech status (not the schedule-level summary).
 *
 * The `currentTechStatus` comes from `schedule_technicians.status` for the
 * technician being transitioned, NOT from `schedules.status`.
 */
export function validateTransition(
  oldStatus: JobStatus,
  newStatus: JobStatus,
  userRole: string,
  scheduleTechnicianIds: string[],
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

  // field_technician can only advance their own job
  if (userRole === 'field_technician') {
    if (!scheduleTechnicianIds.includes(userId)) {
      throw new ValidationError('You can only update your own jobs', 403);
    }
    const techAllowed: JobStatus[] = ['scheduled', 'traveling', 'on_site', 'rework_required'];
    if (!techAllowed.includes(oldStatus)) {
      throw new ValidationError(
        `Technicians can only advance jobs from scheduled, traveling, on_site, or rework_required`,
        403,
      );
    }
  }

  // office/dispatcher can review completed + request rework
  if (['office_manager', 'dispatcher'].includes(userRole)) {
    const officeAllowed: JobStatus[] = ['completed', 'rework_required'];
    if (!officeAllowed.includes(oldStatus)) {
      throw new ValidationError(
        `Office staff can only advance jobs from completed or rework_required`,
        403,
      );
    }
  }
}

export interface ScheduleRow {
  id: string;
  project_id: string;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Schedule Status Derivation ───────────────────────────────────────────

/**
 * Derive the aggregate schedules.status from per-technician statuses.
 *
 * Represents the **operational state** — what's actually happening — not
 * the most advanced state:
 *
 *   1. rework_required  — any tech needs rework
 *   2. on_site          — any tech is currently on site
 *   3. traveling        — any tech is traveling
 *   4. scheduled        — any tech is still scheduled (hasn't started)
 *   5. completed        — all active techs have completed (awaiting review)
 *   6. closed           — ALL techs are closed
 */
async function deriveScheduleStatus(scheduleId: string): Promise<JobStatus> {
  const result = await query(
    `SELECT CASE
       WHEN COUNT(*) FILTER (WHERE status = 'rework_required') > 0 THEN 'rework_required'
       WHEN COUNT(*) FILTER (WHERE status = 'on_site') > 0 THEN 'on_site'
       WHEN COUNT(*) FILTER (WHERE status = 'traveling') > 0 THEN 'traveling'
       WHEN COUNT(*) FILTER (WHERE status = 'scheduled') > 0 THEN 'scheduled'
       WHEN COUNT(*) FILTER (WHERE status = 'completed') > 0 THEN 'completed'
       WHEN COUNT(*) FILTER (WHERE status = 'closed') = COUNT(*) THEN 'closed'
       ELSE 'scheduled'
     END::text AS derived_status
     FROM schedule_technicians
     WHERE schedule_id = $1`,
    [scheduleId],
  );
  return (result.rows[0]?.derived_status as JobStatus) ?? 'scheduled';
}

// ─── Row mapper ────────────────────────────────────────────────────────────

/**
 * Map a raw query row into ScheduleWithDetails.
 *
 * Expects `technician_workflow` as a JSON array from json_agg, plus
 * `technician_ids` and `technician_names` as comma-separated strings.
 */
function mapScheduleRow(row: any): ScheduleWithDetails {
  const techIds: string[] = row.technician_ids
    ? typeof row.technician_ids === 'string'
      ? row.technician_ids.split(',').filter(Boolean)
      : row.technician_ids
    : [];
  const techNames: string[] = row.technician_names
    ? typeof row.technician_names === 'string'
      ? row.technician_names.split(',').filter(Boolean)
      : row.technician_names
    : [];

  // Parse the JSON workflow array from the subquery
  let technicianWorkflow: TechnicianWorkflowStatus[] = [];
  if (row.technician_workflow) {
    if (typeof row.technician_workflow === 'string') {
      try { technicianWorkflow = JSON.parse(row.technician_workflow); } catch { /* ignore */ }
    } else if (Array.isArray(row.technician_workflow)) {
      technicianWorkflow = row.technician_workflow;
    }
  }

  // Derive rework_version / has_open_rework from the workflow for backward compat
  const anyTech = technicianWorkflow[0] ?? {};

  return {
    id: row.id,
    project_id: row.project_id,
    scheduled_date: row.scheduled_date,
    start_time: row.start_time,
    end_time: row.end_time,
    status: row.status,
    notes: row.notes,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    project_name: row.project_name,
    project_address: row.project_address,
    project_contact_name: row.project_contact_name,
    project_contact_phone: row.project_contact_phone,
    technician_name: techNames.join(', '),
    technician_ids: techIds,
    technician_names: techNames,
    technician_workflow: technicianWorkflow,
    // Backward compat fields — derived from the first tech's workflow
    current_rework_version: anyTech.current_rework_version ?? 0,
    has_open_rework: anyTech.has_open_rework ?? false,
    note_count: row.note_count ?? 0,
    attachment_count: row.attachment_count ?? 0,
    signature_count: row.signature_count ?? 0,
    project_latitude: row.project_latitude,
    project_longitude: row.project_longitude,
    project_geofence_radius: row.project_geofence_radius,
    clock_in_lat: row.clock_in_lat,
    clock_in_lng: row.clock_in_lng,
    clock_in_accuracy: row.clock_in_accuracy,
    clock_in_time: row.clock_in_time,
  };
}

const WORKFLOW_SUBQUERY = `
  COALESCE(
    (SELECT json_agg(
      json_build_object(
        'technician_id', st2.technician_id,
        'technician_name', u2.name,
        'status', st2.status,
        'completed_at', st2.completed_at,
        'closed_at', st2.closed_at,
        'current_rework_version', st2.current_rework_version,
        'has_open_rework', st2.has_open_rework
      )
      ORDER BY u2.name
    ) FROM schedule_technicians st2
    JOIN users u2 ON u2.id = st2.technician_id
    WHERE st2.schedule_id = s.id),
    '[]'::json
  ) AS technician_workflow
`;

const SCHEDULE_SELECT = `
  SELECT s.id, s.project_id,
         s.scheduled_date::text AS scheduled_date,
         s.start_time, s.end_time, s.status, s.notes,
         s.created_by, s.created_at, s.updated_at,
         p.name AS project_name, p.address AS project_address,
         p.contact_name AS project_contact_name, p.contact_phone AS project_contact_phone,
         p.latitude AS project_latitude, p.longitude AS project_longitude,
         p.geofence_radius AS project_geofence_radius,
         COALESCE(
           string_agg(DISTINCT st.technician_id::text, ',' ORDER BY st.technician_id::text), ''
         ) AS technician_ids,
         COALESCE(
           string_agg(DISTINCT u.name, ',' ORDER BY u.name), ''
         ) AS technician_names,
         ${WORKFLOW_SUBQUERY}
`;

const SCHEDULE_FROM = `
  FROM schedules s
  JOIN projects p ON p.id = s.project_id
  LEFT JOIN schedule_technicians st ON st.schedule_id = s.id
  LEFT JOIN users u ON u.id = st.technician_id
`;

export async function findAll(filters?: {
  date?: string;
  technician_id?: string;
  project_id?: string;
  status?: string;
}): Promise<ScheduleWithDetails[]> {
  let sql = SCHEDULE_SELECT + SCHEDULE_FROM + ' WHERE 1=1';
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.date) {
    sql += ` AND s.scheduled_date = $${paramIndex++}`;
    params.push(filters.date);
  }
  if (filters?.technician_id) {
    sql += ` AND EXISTS (SELECT 1 FROM schedule_technicians st2 WHERE st2.schedule_id = s.id AND st2.technician_id = $${paramIndex++})`;
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

  sql += ' GROUP BY s.id, p.id';
  sql += ' ORDER BY s.scheduled_date, s.start_time NULLS LAST';

  const result = await query(sql, params);
  return result.rows.map(mapScheduleRow);
}

export async function findById(id: string): Promise<ScheduleWithDetails | null> {
  const result = await query(
    SCHEDULE_SELECT + `,
      (SELECT COUNT(*)::int FROM job_notes WHERE schedule_id = s.id) AS note_count,
      (SELECT COUNT(*)::int FROM job_attachments WHERE schedule_id = s.id) AS attachment_count,
      (SELECT COUNT(*)::int FROM signatures WHERE schedule_id = s.id) AS signature_count
    ` + SCHEDULE_FROM + ' WHERE s.id = $1 GROUP BY s.id, p.id',
    [id],
  );
  return result.rows[0] ? mapScheduleRow(result.rows[0]) : null;
}

export async function findByDateRange(from: string, to: string): Promise<ScheduleWithDetails[]> {
  const result = await query(
    SCHEDULE_SELECT + SCHEDULE_FROM +
    ' WHERE s.scheduled_date >= $1 AND s.scheduled_date <= $2' +
    ' GROUP BY s.id, p.id' +
    ' ORDER BY s.scheduled_date, s.start_time NULLS LAST',
    [from, to],
  );
  return result.rows.map(mapScheduleRow);
}

export async function findForReview(): Promise<ScheduleWithDetails[]> {
  // Return schedules where ANY technician has work completed or needs rework
  const result = await query(
    SCHEDULE_SELECT + `,
      (SELECT COUNT(*)::int FROM job_notes WHERE schedule_id = s.id) AS note_count,
      (SELECT COUNT(*)::int FROM job_attachments WHERE schedule_id = s.id) AS attachment_count,
      (SELECT COUNT(*)::int FROM signatures WHERE schedule_id = s.id) AS signature_count,
      (SELECT te.clock_in_lat FROM time_entries te
         JOIN schedule_technicians st3 ON st3.technician_id = te.user_id
         WHERE st3.schedule_id = s.id AND te.project_id = s.project_id
           AND te.clock_in >= s.scheduled_date::timestamptz - interval '1 day'
         ORDER BY te.clock_in LIMIT 1) AS clock_in_lat,
      (SELECT te.clock_in_lng FROM time_entries te
         JOIN schedule_technicians st3 ON st3.technician_id = te.user_id
         WHERE st3.schedule_id = s.id AND te.project_id = s.project_id
           AND te.clock_in >= s.scheduled_date::timestamptz - interval '1 day'
         ORDER BY te.clock_in LIMIT 1) AS clock_in_lng,
      (SELECT te.clock_in_accuracy FROM time_entries te
         JOIN schedule_technicians st3 ON st3.technician_id = te.user_id
         WHERE st3.schedule_id = s.id AND te.project_id = s.project_id
           AND te.clock_in >= s.scheduled_date::timestamptz - interval '1 day'
         ORDER BY te.clock_in LIMIT 1) AS clock_in_accuracy,
      (SELECT te.clock_in::text FROM time_entries te
         JOIN schedule_technicians st3 ON st3.technician_id = te.user_id
         WHERE st3.schedule_id = s.id AND te.project_id = s.project_id
           AND te.clock_in >= s.scheduled_date::timestamptz - interval '1 day'
         ORDER BY te.clock_in LIMIT 1) AS clock_in_time
    ` + SCHEDULE_FROM +
    // Filter: any technician is completed, closed-but-unreviewed, or rework_required
    ` WHERE EXISTS (
      SELECT 1 FROM schedule_technicians st4
      WHERE st4.schedule_id = s.id
        AND st4.status IN ('completed', 'rework_required')
    )` +
    ' GROUP BY s.id, p.id' +
    ' ORDER BY s.scheduled_date DESC, s.updated_at DESC',
  );
  return result.rows.map(mapScheduleRow);
}

export async function findUnassigned(): Promise<ScheduleWithDetails[]> {
  const result = await query(
    SCHEDULE_SELECT + SCHEDULE_FROM +
    ' WHERE s.status = \'scheduled\' AND s.start_time IS NULL' +
    ' GROUP BY s.id, p.id' +
    ' ORDER BY s.scheduled_date',
  );
  return result.rows.map(mapScheduleRow);
}

export async function findByTechnician(technicianId: string): Promise<ScheduleWithDetails[]> {
  const result = await query(
    SCHEDULE_SELECT + SCHEDULE_FROM +
    ' WHERE st.technician_id = $1' +
    ' GROUP BY s.id, p.id' +
    ' ORDER BY s.scheduled_date DESC, s.start_time NULLS LAST',
    [technicianId],
  );
  return result.rows.map(mapScheduleRow);
}

export async function create(data: {
  project_id: string;
  technician_ids: string[];
  scheduled_date: string;
  start_time?: string | null;
  end_time?: string | null;
  notes?: string | null;
  created_by: string;
}): Promise<Schedule> {
  // Insert the schedule
  const schedResult = await query(
    `INSERT INTO schedules (project_id, scheduled_date, start_time, end_time, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      data.project_id,
      data.scheduled_date,
      data.start_time ?? null,
      data.end_time ?? null,
      data.notes ?? null,
      data.created_by,
    ],
  );
  const schedule = schedResult.rows[0];

  // Insert each schedule_technician row (defaults to status='scheduled')
  if (data.technician_ids.length > 0) {
    const values = data.technician_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
    await query(
      `INSERT INTO schedule_technicians (schedule_id, technician_id) VALUES ${values} ON CONFLICT DO NOTHING`,
      [schedule.id, ...data.technician_ids],
    );
  }

  return schedule;
}

export async function update(
  id: string,
  data: {
    project_id?: string;
    technician_ids?: string[];
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

  if (fields.length > 0) {
    fields.push('updated_at = NOW()');
    params.push(id);

    await query(
      `UPDATE schedules SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      params,
    );
  }

  // Replace technician assignments if provided
  if (data.technician_ids !== undefined) {
    await query('DELETE FROM schedule_technicians WHERE schedule_id = $1', [id]);
    if (data.technician_ids.length > 0) {
      const values = data.technician_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
      await query(
        `INSERT INTO schedule_technicians (schedule_id, technician_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [id, ...data.technician_ids],
      );
    }
  }

  return findById(id);
}

export async function deleteById(id: string): Promise<boolean> {
  const result = await query('DELETE FROM schedules WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

// ─── Conflict Detection ────────────────────────────────────────────────────

export interface ConflictInfo {
  id: string;
  project_name: string;
  technician_id: string;
  technician_name: string;
  start_time: string;
  end_time: string;
  conflict_type: 'overlap' | 'buffer';
}

const BUFFER_MINUTES = 30;

/**
 * Find schedule conflicts for technicians on a given date.
 * Checks each technician individually against existing schedules.
 */
export async function findConflicts(
  technicianIds: string[],
  scheduledDate: string,
  startTime: string,
  endTime: string,
  excludeScheduleId?: string,
): Promise<ConflictInfo[]> {
  const startParts = startTime.split(':').map(Number);
  const endParts = endTime.split(':').map(Number);
  const requestedStart = startParts[0] * 60 + startParts[1];
  const requestedEnd = endParts[0] * 60 + endParts[1];

  let sql = `
    SELECT s.id, s.start_time, s.end_time, p.name AS project_name,
           st.technician_id, u.name AS technician_name
    FROM schedules s
    JOIN projects p ON p.id = s.project_id
    JOIN schedule_technicians st ON st.schedule_id = s.id
    JOIN users u ON u.id = st.technician_id
    WHERE st.technician_id = ANY($1::uuid[])
      AND s.scheduled_date = $2
      AND s.start_time IS NOT NULL
      AND s.end_time IS NOT NULL
  `;
  const params: unknown[] = [technicianIds, scheduledDate];
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

    const requestedEndWithBuffer = requestedEnd + BUFFER_MINUTES;
    const existingEndWithBuffer = existingEnd + BUFFER_MINUTES;

    if (existingStart < requestedEndWithBuffer && existingEndWithBuffer > requestedStart) {
      const isOverlap = existingStart < requestedEnd && existingEnd > requestedStart;
      conflicts.push({
        id: row.id,
        project_name: row.project_name,
        technician_id: row.technician_id,
        technician_name: row.technician_name,
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
    return `${c.technician_name}\n  "${c.project_name}" (${start} — ${end}) — ${reason}`;
  });
  return `Technician(s) have schedule conflicts:\n${details.join('\n')}\n\nMinimum 30-minute buffer required.`;
}

// ─── Status Transition with Transaction ───────────────────────────────────

export interface UpdateStatusResult {
  schedule: ScheduleWithDetails;
  audit: AuditLog;
}

/**
 * Update a specific technician's workflow status on a schedule.
 *
 * - Writes to `schedule_technicians.status` (the authoritative per-tech state).
 * - Derives and updates `schedules.status` from the aggregate of all techs.
 * - Sets `completed_at` / `closed_at` on the per-tech row at transition time.
 *
 * @param data.technician_id - Required for field_technician; optional for
 *   office/admin. If omitted for office/admin, updates ALL technicians on
 *   the schedule (useful for bulk close).
 */
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
      'SELECT status, project_id FROM schedules WHERE id = $1 FOR UPDATE',
      [data.id],
    );

    if (lockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new ValidationError('Schedule not found', 404);
    }

    const projectId = lockResult.rows[0].project_id;

    // Fetch all assigned technicians for ownership check
    const techResult = await client.query(
      'SELECT technician_id FROM schedule_technicians WHERE schedule_id = $1',
      [data.id],
    );
    const techIds = techResult.rows.map((r: any) => r.technician_id);

    // Determine which technician(s) to update
    const targetTechIds: string[] = [];
    if (data.technician_id) {
      // Validate the target is actually assigned to this schedule
      if (!techIds.includes(data.technician_id)) {
        await client.query('ROLLBACK');
        throw new ValidationError('Technician is not assigned to this schedule', 400);
      }
      targetTechIds.push(data.technician_id);
    } else {
      // No specific tech — field_technician must target themselves
      if (data.user_role === 'field_technician') {
        await client.query('ROLLBACK');
        throw new ValidationError('Technician ID is required', 400);
      }
      // Office/admin with no tech_id: update all
      targetTechIds.push(...techIds);
    }

    if (targetTechIds.length === 0) {
      await client.query('ROLLBACK');
      throw new ValidationError('No technicians to update', 400);
    }

    // For each target technician, get their current per-tech status and validate
    for (const techId of targetTechIds) {
      const techStatusResult = await client.query(
        'SELECT status FROM schedule_technicians WHERE schedule_id = $1 AND technician_id = $2',
        [data.id, techId],
      );

      if (techStatusResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new ValidationError(`Technician ${techId} not found on this schedule`, 404);
      }

      const oldTechStatus = techStatusResult.rows[0].status as JobStatus;

      // Validate the transition
      validateTransition(
        oldTechStatus,
        data.status,
        data.user_role,
        [techId], // For field_technician: check they own this row
        data.technician_id || data.user_id,
      );
    }

    // Update each target technician's schedule_technicians row
    for (const techId of targetTechIds) {
      await client.query(
        `UPDATE schedule_technicians
         SET status = $1::varchar,
             updated_at = NOW(),
             completed_at = CASE WHEN $1::varchar = 'completed' THEN NOW() ELSE completed_at END,
             closed_at = CASE WHEN $1::varchar = 'closed' THEN NOW() ELSE closed_at END,
             has_open_rework = CASE
               WHEN $1::varchar = 'rework_required' THEN TRUE
               WHEN $1::varchar IN ('completed', 'closed') THEN FALSE
               ELSE has_open_rework
             END
         WHERE schedule_id = $2 AND technician_id = $3`,
        [data.status, data.id, techId],
      );
    }

    // Derive the aggregate schedule status from per-tech rows
    const derivedStatus = await deriveScheduleStatus(data.id);

    // Update the schedule row with the derived status
    await client.query(
      `UPDATE schedules SET status = $1, updated_at = NOW() WHERE id = $2`,
      [derivedStatus, data.id],
    );

    // Insert audit log entry
    const techDescription = targetTechIds.length === 1
      ? `technician ${targetTechIds[0]}`
      : `${targetTechIds.length} technicians`;
    let auditAction = 'status_change';
    if (data.status === 'rework_required') {
      auditAction = 'rework_requested';
    } else if (data.status === 'closed') {
      auditAction = 'review_closed';
    }

    const auditMetadata = data.notes
      ? JSON.stringify({ notes: data.notes, action: auditAction, technicians: targetTechIds })
      : JSON.stringify({ action: auditAction, technicians: targetTechIds });

    const auditResult = await client.query(
      `INSERT INTO audit_logs (schedule_id, user_id, action, old_status, new_status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.id, data.user_id, auditAction, lockResult.rows[0].status, derivedStatus, auditMetadata],
    );

    // Auto-complete project if this was the last non-closed schedule
    if (derivedStatus === 'closed') {
      const remainingResult = await client.query(
        `SELECT COUNT(*) AS count FROM schedules WHERE project_id = $1 AND status NOT IN ('closed', 'cancelled')`,
        [projectId],
      );
      const remaining = parseInt(remainingResult.rows[0].count, 10);
      if (remaining === 0) {
        await client.query(
          `UPDATE projects SET status = 'completed', updated_at = NOW() WHERE id = $1 AND status <> 'cancelled'`,
          [projectId],
        );
      }
    }

    // Revert project to active if a closed schedule is reopened
    if (lockResult.rows[0].status === 'closed' && derivedStatus !== 'closed') {
      await client.query(
        `UPDATE projects SET status = 'active', updated_at = NOW() WHERE id = $1 AND status = 'completed'`,
        [projectId],
      );
    }

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
