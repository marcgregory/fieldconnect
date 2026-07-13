/**
 * Completion report queries for PDF generation.
 *
 * Gathers all data needed for a customer-facing completion summary:
 * project info, assigned technicians, time entries, job notes,
 * photo attachments, and signatures.
 */

import { query } from '../index';

export interface CompletionReportData {
  project: {
    id: string;
    name: string;
    address: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    status: string;
  };
  schedule: {
    id: string;
    scheduled_date: string;
    status: string;
    created_at: string;
  } | null;
  technicians: {
    id: string;
    name: string;
    email: string;
    status: string;
  }[];
  timeEntries: {
    id: string;
    technician_name: string;
    clock_in: string;
    clock_out: string | null;
    break_minutes: number;
    duration_hours: number;
    notes: string | null;
  }[];
  notes: {
    id: string;
    content: string;
    note_type: string;
    technician_name: string;
    created_at: string;
  }[];
  attachments: {
    id: string;
    file_name: string;
    attachment_type: string;
    created_at: string;
    uploaded_by: string;
    /** MIME type hint for image embedding decisions */
    mime_type?: string | null;
  }[];
  signatures: {
    id: string;
    signature_data: string;
    label: string;
    technician_name: string;
    created_at: string;
  }[];
}

/**
 * Parse a numeric value returned by pg (which may be a string for NUMERIC columns)
 * into a JavaScript number, defaulting to 0 if null/undefined/invalid.
 */
function parseNumeric(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  const n = parseFloat(String(val));
  return isNaN(n) ? 0 : n;
}

/**
 * Fetch full completion report data for a schedule.
 */
export async function getCompletionReport(
  scheduleId: string,
): Promise<CompletionReportData> {
  // Project + schedule info
  const scheduleResult = await query(
    `SELECT
       s.id, s.scheduled_date, s.status, s.created_at,
       p.id AS project_id, p.name AS project_name, p.address AS project_address,
       p.contact_name, p.contact_phone, p.status AS project_status
     FROM schedules s
     JOIN projects p ON p.id = s.project_id
     WHERE s.id = $1`,
    [scheduleId],
  );

  const sched = scheduleResult.rows[0] as
    | {
        id: string;
        scheduled_date: string;
        status: string;
        created_at: string;
        project_id: string;
        project_name: string;
        project_address: string | null;
        contact_name: string | null;
        contact_phone: string | null;
        project_status: string;
      }
    | undefined;

  if (!sched) {
    throw new Error('Schedule not found');
  }

  const project: CompletionReportData['project'] = {
    id: sched.project_id,
    name: sched.project_name,
    address: sched.project_address,
    contact_name: sched.contact_name,
    contact_phone: sched.contact_phone,
    status: sched.project_status,
  };

  const schedule: CompletionReportData['schedule'] = {
    id: sched.id,
    scheduled_date: sched.scheduled_date,
    status: sched.status,
    created_at: sched.created_at,
  };

  // Technicians assigned to this schedule
  const techResult = await query(
    `SELECT
       u.id, u.name, u.email, st.status
     FROM schedule_technicians st
     JOIN users u ON u.id = st.technician_id
     WHERE st.schedule_id = $1
     ORDER BY u.name`,
    [scheduleId],
  );
  const technicians = techResult.rows.map(
    (r: { id: string; name: string; email: string; status: string }) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      status: r.status,
    }),
  );

  // Time entries for this schedule — bound to both the schedule's technicians
  // and the scheduled date to avoid pulling entries from other dates/projects
  const teResult = await query(
    `SELECT
       te.id,
       u.name AS technician_name,
       te.clock_in,
       te.clock_out,
       te.break_minutes,
       ROUND(
         EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in)) / 3600.0
         - (te.break_minutes::numeric / 60.0),
         2
       ) AS duration_hours,
       te.notes
     FROM time_entries te
     JOIN schedule_technicians st ON st.schedule_id = $1 AND st.technician_id = te.user_id
     JOIN users u ON u.id = te.user_id
     WHERE te.project_id = $2
       AND te.clock_in::date = $3::date
     ORDER BY te.clock_in`,
    [scheduleId, project.id, schedule.scheduled_date],
  );
  const timeEntries = teResult.rows.map(
    (r: {
      id: string;
      technician_name: string;
      clock_in: string;
      clock_out: string | null;
      break_minutes: unknown;
      duration_hours: unknown;
      notes: string | null;
    }) => ({
      id: r.id,
      technician_name: r.technician_name,
      clock_in: r.clock_in,
      clock_out: r.clock_out,
      break_minutes: parseNumeric(r.break_minutes),
      duration_hours: parseNumeric(r.duration_hours),
      notes: r.notes,
    }),
  );

  // Job notes
  const noteResult = await query(
    `SELECT
       jn.id, jn.content, jn.note_type,
       u.name AS technician_name,
       jn.created_at
     FROM job_notes jn
     JOIN users u ON u.id = jn.user_id
     WHERE jn.schedule_id = $1
     ORDER BY jn.created_at`,
    [scheduleId],
  );
  const notes = noteResult.rows as CompletionReportData['notes'];

  // Attachments (photos)
  const attResult = await query(
    `SELECT
       ja.id, ja.file_name, ja.attachment_type, ja.mime_type,
       ja.created_at,
       u.name AS uploaded_by
     FROM job_attachments ja
     JOIN users u ON u.id = ja.user_id
     WHERE ja.schedule_id = $1
     ORDER BY ja.created_at`,
    [scheduleId],
  );
  const attachments = attResult.rows as CompletionReportData['attachments'];

  // Signatures
  const sigResult = await query(
    `SELECT
       sig.id, sig.signature_data, sig.label,
       u.name AS technician_name,
       sig.created_at
     FROM signatures sig
     JOIN users u ON u.id = sig.user_id
     WHERE sig.schedule_id = $1
     ORDER BY sig.created_at`,
    [scheduleId],
  );
  const signatures = sigResult.rows as CompletionReportData['signatures'];

  return {
    project,
    schedule,
    technicians,
    timeEntries,
    notes,
    attachments,
    signatures,
  };
}
