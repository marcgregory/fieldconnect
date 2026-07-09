import { query } from '../index';

// Whitelist of IANA timezones supported by the application
const VALID_TIMEZONES = new Set([
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
  'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Caracas',
  'America/Chicago', 'America/Denver', 'America/Guatemala', 'America/Halifax',
  'America/Lima', 'America/Los_Angeles', 'America/Mexico_City', 'America/New_York',
  'America/Panama', 'America/Phoenix', 'America/Puerto_Rico', 'America/Santiago',
  'America/Sao_Paulo', 'America/St_Johns', 'America/Toronto', 'America/Vancouver',
  'America/Winnipeg',
  'Asia/Baghdad', 'Asia/Bangkok', 'Asia/Colombo', 'Asia/Dhaka',
  'Asia/Dubai', 'Asia/Ho_Chi_Minh', 'Asia/Hong_Kong', 'Asia/Jakarta',
  'Asia/Karachi', 'Asia/Kathmandu', 'Asia/Kolkata', 'Asia/Kuala_Lumpur',
  'Asia/Manila', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore',
  'Asia/Taipei', 'Asia/Tokyo', 'Asia/Yangon',
  'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Darwin',
  'Australia/Melbourne', 'Australia/Perth', 'Australia/Sydney',
  'Canada/Atlantic', 'Canada/Central', 'Canada/Eastern', 'Canada/Mountain', 'Canada/Pacific',
  'Europe/Amsterdam', 'Europe/Amsterdam', 'Europe/Athens', 'Europe/Berlin',
  'Europe/Brussels', 'Europe/Budapest', 'Europe/Copenhagen', 'Europe/Dublin',
  'Europe/Helsinki', 'Europe/Istanbul', 'Europe/Kyiv', 'Europe/Lisbon',
  'Europe/London', 'Europe/Madrid', 'Europe/Moscow', 'Europe/Oslo',
  'Europe/Paris', 'Europe/Prague', 'Europe/Rome', 'Europe/Stockholm',
  'Europe/Vienna', 'Europe/Warsaw', 'Europe/Zurich',
  'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Guam', 'Pacific/Honolulu',
  'Pacific/Samoa', 'Pacific/Tahiti', 'Pacific/Tongatapu',
  'UTC',
]);

function validateTimezone(tz: string | undefined): string {
  if (!tz) return 'Asia/Manila';
  if (!VALID_TIMEZONES.has(tz)) {
    // Fallback to a safe default instead of crashing
    return 'Asia/Manila';
  }
  return tz;
}

export interface TimeEntryReportRow {
  id: string;
  technician_id: string;
  technician_name: string;
  project_id: string;
  project_name: string;
  project_address: string | null;
  scheduled_date: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  duration_hours: number;
  notes: string | null;
}

export interface HoursSummaryRow {
  technician_id: string;
  technician_name: string;
  total_hours: number;
  entry_count: number;
}

export interface ProjectSummaryRow {
  project_id: string;
  project_name: string;
  total_hours: number;
  entry_count: number;
  technician_count: number;
}

export interface DashboardSummaryRow {
  hours_this_week: number;
  active_technicians: number;
  completed_today: number;
  needs_review_count: number;
  late_jobs_count: number;
}

export interface PaginatedResult<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

function buildSqlWithPagination(
  baseSelect: string,
  baseFrom: string,
  params: unknown[],
  filters: { from?: string; to?: string; project_id?: string; technician_id?: string },
  pagination: { page: number; limit: number },
): { sql: string; countSql: string; params: unknown[] } {
  let whereClause = ' WHERE 1=1';
  let idx = params.length + 1;

  if (filters.from) {
    whereClause += ` AND te.clock_in >= $${idx++}::timestamptz`;
    params.push(filters.from);
  }
  if (filters.to) {
    // Include the full "to" day: clock_in < (to_date + 1 day)
    whereClause += ` AND te.clock_in < ($${idx++}::timestamptz + INTERVAL '1 day')`;
    params.push(filters.to);
  }
  if (filters.project_id) {
    whereClause += ` AND te.project_id = $${idx++}`;
    params.push(filters.project_id);
  }
  if (filters.technician_id) {
    whereClause += ` AND te.user_id = $${idx++}`;
    params.push(filters.technician_id);
  }

  const countSql = `SELECT COUNT(*)::int AS total${baseFrom}${whereClause}`;
  const offset = (pagination.page - 1) * pagination.limit;
  const sql = `${baseSelect}${baseFrom}${whereClause} ORDER BY te.clock_in DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(pagination.limit, offset);

  return { sql, countSql, params };
}

// ─── Time Entries Report ──────────────────────────────────────────────────
export async function getTimeEntriesReport(
  filters: {
    from?: string;
    to?: string;
    project_id?: string;
    technician_id?: string;
    tz?: string;
  },
  pagination: { page: number; limit: number } = { page: 1, limit: 20 },
): Promise<PaginatedResult<TimeEntryReportRow>> {
  const timezone = validateTimezone(filters?.tz);
  const baseSelect = `
    SELECT
      te.id,
      te.user_id AS technician_id,
      u.name AS technician_name,
      te.project_id,
      p.name AS project_name,
      p.address AS project_address,
      s.scheduled_date,
      te.clock_in,
      te.clock_out,
      te.break_minutes,
      ROUND(
        EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in)) / 3600.0
        - (te.break_minutes::numeric / 60.0),
        2
      ) AS duration_hours,
      te.notes`;
  const baseFrom = `
    FROM time_entries te
    JOIN users u ON u.id = te.user_id
    JOIN projects p ON p.id = te.project_id
    LEFT JOIN schedules s ON s.project_id = te.project_id
      AND s.scheduled_date = (te.clock_in AT TIME ZONE '${timezone}')::date
    LEFT JOIN schedule_technicians st ON st.schedule_id = s.id AND st.technician_id = te.user_id`;

  const params: unknown[] = [];
  const { sql, countSql, params: allParams } = buildSqlWithPagination(
    baseSelect, baseFrom, params, filters, pagination,
  );

  const [dataResult, countResult] = await Promise.all([
    query(sql, allParams),
    query(countSql, allParams.slice(0, allParams.length - 2)),
  ]);

  return {
    rows: dataResult.rows,
    total: countResult.rows[0]?.total ?? 0,
    page: pagination.page,
    limit: pagination.limit,
    total_pages: Math.ceil((countResult.rows[0]?.total ?? 0) / pagination.limit),
  };
}

/** Non-paginated variant for CSV export — returns ALL matching rows */
export async function getTimeEntriesReportAll(filters: {
  from?: string;
  to?: string;
  project_id?: string;
  technician_id?: string;
  tz?: string;
}): Promise<TimeEntryReportRow[]> {
  const timezone = validateTimezone(filters?.tz);
  let sql = `
    SELECT
      te.id,
      te.user_id AS technician_id,
      u.name AS technician_name,
      te.project_id,
      p.name AS project_name,
      p.address AS project_address,
      s.scheduled_date,
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
    JOIN users u ON u.id = te.user_id
    JOIN projects p ON p.id = te.project_id
    LEFT JOIN schedules s ON s.project_id = te.project_id
      AND s.scheduled_date = (te.clock_in AT TIME ZONE '${timezone}')::date
    LEFT JOIN schedule_technicians st ON st.schedule_id = s.id AND st.technician_id = te.user_id
    WHERE 1=1`;
  const params: unknown[] = [];
  let idx = 1;

  if (filters.from) {
    sql += ` AND te.clock_in >= $${idx++}::timestamptz`;
    params.push(filters.from);
  }
  if (filters.to) {
    sql += ` AND te.clock_in < ($${idx++}::timestamptz + INTERVAL '1 day')`;
    params.push(filters.to);
  }
  if (filters.project_id) {
    sql += ` AND te.project_id = $${idx++}`;
    params.push(filters.project_id);
  }
  if (filters.technician_id) {
    sql += ` AND te.user_id = $${idx++}`;
    params.push(filters.technician_id);
  }

  sql += ' ORDER BY te.clock_in DESC';

  const result = await query(sql, params);
  return result.rows;
}

// ─── Hours by Technician ──────────────────────────────────────────────────
export async function getHoursByTechnician(filters: {
  from?: string;
  to?: string;
}): Promise<HoursSummaryRow[]> {
  let sql = `
    SELECT
      u.id AS technician_id,
      u.name AS technician_name,
      ROUND(SUM(
        EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in)) / 3600.0
        - (te.break_minutes::numeric / 60.0)
      ), 2) AS total_hours,
      COUNT(*)::int AS entry_count
    FROM time_entries te
    JOIN users u ON u.id = te.user_id
    WHERE u.role = 'field_technician'`;
  const params: unknown[] = [];
  let idx = 1;

  if (filters.from) {
    sql += ` AND te.clock_in >= $${idx++}::timestamptz`;
    params.push(filters.from);
  }
  if (filters.to) {
    sql += ` AND te.clock_in < ($${idx++}::timestamptz + INTERVAL '1 day')`;
    params.push(filters.to);
  }

  sql += ' GROUP BY u.id, u.name ORDER BY total_hours DESC';

  const result = await query(sql, params);
  return result.rows;
}

// ─── Hours by Project ─────────────────────────────────────────────────────
export async function getHoursByProject(filters: {
  from?: string;
  to?: string;
}): Promise<ProjectSummaryRow[]> {
  let sql = `
    SELECT
      p.id AS project_id,
      p.name AS project_name,
      ROUND(SUM(
        EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in)) / 3600.0
        - (te.break_minutes::numeric / 60.0)
      ), 2) AS total_hours,
      COUNT(*)::int AS entry_count,
      COUNT(DISTINCT te.user_id)::int AS technician_count
    FROM time_entries te
    JOIN projects p ON p.id = te.project_id`;
  const params: unknown[] = [];
  let idx = 1;

  if (filters.from) {
    sql += ` WHERE te.clock_in >= $${idx++}::timestamptz`;
    params.push(filters.from);
  }
  if (filters.to) {
    sql += `${params.length === 0 ? ' WHERE' : ' AND'} te.clock_in < ($${idx++}::timestamptz + INTERVAL '1 day')`;
    params.push(filters.to);
  }

  sql += ' GROUP BY p.id, p.name ORDER BY total_hours DESC';

  const result = await query(sql, params);
  return result.rows;
}

// ─── Dashboard Summary ────────────────────────────────────────────────────
export async function getDashboardSummary(): Promise<DashboardSummaryRow> {
  const result = await query(`
    SELECT
      COALESCE(ROUND(SUM(
        EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in)) / 3600.0
        - (te.break_minutes::numeric / 60.0)
      ), 1), 0) AS hours_this_week,
      (SELECT COUNT(DISTINCT technician_id) FROM schedule_technicians WHERE status IN ('traveling', 'on_site'))::int AS active_technicians,
      (SELECT COUNT(*)::int FROM schedule_technicians WHERE status = 'completed' AND schedule_id IN (SELECT id FROM schedules WHERE scheduled_date = CURRENT_DATE)) AS completed_today,
      (SELECT COUNT(*)::int FROM schedule_technicians WHERE status = 'completed') AS needs_review_count,
      (SELECT COUNT(*)::int FROM schedules WHERE status = 'scheduled' AND scheduled_date < CURRENT_DATE) AS late_jobs_count
    FROM time_entries te
    WHERE te.clock_in >= date_trunc('week', CURRENT_DATE)
  `);
  return result.rows[0];
}
