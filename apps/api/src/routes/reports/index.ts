import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/auth';
import * as reportQueries from '../../db/queries/reports';

type ExportRow = Awaited<ReturnType<typeof reportQueries.getTimeEntriesReportAll>>[number];

/** Format a full datetime string with timezone support (for clock_in / clock_out). */
function formatDt(dateStr: string | null, tz?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
    ...(tz ? { timeZone: tz } : {}),
  });
}

/** Format a date-only string (scheduled_date) — no timezone conversion. */
function formatDateOnly(dateStr: string | Date | null | unknown): string {
  if (!dateStr) return '';
  let d: Date;
  if (typeof dateStr === 'string') {
    // scheduled_date is YYYY-MM-DD, parse as local date
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  } else if (dateStr instanceof Date) {
    d = dateStr;
  } else {
    return String(dateStr);
  }
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const TIME_ENTRY_EXPORT_COLUMNS = [
  'Technician',
  'Project',
  'Address',
  'Scheduled Date',
  'Clock In',
  'Clock Out',
  'Duration (hrs)',
  'Break (min)',
  'Notes',
] as const;

function exportValues(row: ExportRow, tz?: string): Array<string | number> {
  return [
    row.technician_name || '',
    row.project_name || '',
    row.project_address || '',
    formatDateOnly(row.scheduled_date),
    formatDt(row.clock_in, tz),
    formatDt(row.clock_out, tz),
    `${row.duration_hours}h`,
    `${row.break_minutes}m`,
    row.notes || '—',
  ];
}

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildStyledExcel(rows: ExportRow[], tz?: string): string {
  const headerCells = TIME_ENTRY_EXPORT_COLUMNS
    .map((column) => `<th>${escapeHtml(column)}</th>`)
    .join('');

  const bodyRows = rows
    .map((row, index) => {
      const cells = exportValues(row, tz)
        .map((value, columnIndex) => {
          const align = columnIndex === 6 || columnIndex === 7 ? ' class="number"' : '';
          return `<td${align}>${escapeHtml(value)}</td>`;
        })
        .join('');
      return `<tr class="${index % 2 === 0 ? 'band' : 'plain'}">${cells}</tr>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11pt; }
    th { background: #2563eb; color: #ffffff; font-weight: 700; border: 1px solid #1d4ed8; padding: 4px 6px; white-space: nowrap; }
    td { border: 1px solid #7dd3fc; padding: 6px; vertical-align: middle; white-space: normal; }
    tr.band td { background: #c7eef8; }
    tr.plain td { background: #ffffff; }
    .number { text-align: right; mso-number-format: "0.00"; }
  </style>
</head>
<body>
  <table>
    <colgroup>
      <col style="width: 120px" />
      <col style="width: 190px" />
      <col style="width: 260px" />
      <col style="width: 120px" />
      <col style="width: 150px" />
      <col style="width: 150px" />
      <col style="width: 95px" />
      <col style="width: 110px" />
      <col style="width: 260px" />
    </colgroup>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
}

export async function reportRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/reports/time-entries',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (request, reply) => {
      const { from, to, project_id, technician_id, page, limit } = request.query as {
        from?: string;
        to?: string;
        project_id?: string;
        technician_id?: string;
        page?: string;
        limit?: string;
      };

      const result = await reportQueries.getTimeEntriesReport(
        { from, to, project_id, technician_id },
        { page: parseInt(page || '1', 10), limit: parseInt(limit || '20', 10) },
      );

      return { success: true, data: result.rows, pagination: { total: result.total, page: result.page, limit: result.limit, total_pages: result.total_pages } };
    },
  );

  app.get(
    '/api/v1/reports/technicians',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (request, reply) => {
      const { from, to } = request.query as { from?: string; to?: string };

      const rows = await reportQueries.getHoursByTechnician({ from, to });

      return { success: true, data: rows };
    },
  );

  app.get(
    '/api/v1/reports/projects',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (request, reply) => {
      const { from, to } = request.query as { from?: string; to?: string };

      const rows = await reportQueries.getHoursByProject({ from, to });

      return { success: true, data: rows };
    },
  );

  app.get(
    '/api/v1/reports/time-entries.csv',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (request, reply) => {
      const { from, to, project_id, technician_id } = request.query as {
        from?: string;
        to?: string;
        project_id?: string;
        technician_id?: string;
      };

      const rows = await reportQueries.getTimeEntriesReportAll({
        from,
        to,
        project_id,
        technician_id,
      });

      const header = TIME_ENTRY_EXPORT_COLUMNS.join(',');
      const csvRows = rows.map((row) => exportValues(row).map(escapeCsv).join(','));
      const csv = [header, ...csvRows].join('\n');

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="time-entries-${from || 'all'}-${to || 'all'}.csv"`);
      return reply.send(csv);
    },
  );

  app.get(
    '/api/v1/reports/time-entries.xls',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (request, reply) => {
      const { from, to, project_id, technician_id, tz } = request.query as {
        from?: string;
        to?: string;
        project_id?: string;
        technician_id?: string;
        tz?: string;
      };

      const rows = await reportQueries.getTimeEntriesReportAll({
        from,
        to,
        project_id,
        technician_id,
      });

      reply.header('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="time-entries-${from || 'all'}-${to || 'all'}.xls"`);
      return reply.send(buildStyledExcel(rows, tz));
    },
  );
}
