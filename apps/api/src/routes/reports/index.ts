import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/auth';
import * as reportQueries from '../../db/queries/reports';

export async function reportRoutes(app: FastifyInstance) {
  // ─── Time Entries Report ──────────────────────────────────────────────────
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

  // ─── Hours by Technician ──────────────────────────────────────────────────
  app.get(
    '/api/v1/reports/technicians',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (request, reply) => {
      const { from, to } = request.query as { from?: string; to?: string };

      const rows = await reportQueries.getHoursByTechnician({ from, to });

      return { success: true, data: rows };
    },
  );

  // ─── Hours by Project ─────────────────────────────────────────────────────
  app.get(
    '/api/v1/reports/projects',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (request, reply) => {
      const { from, to } = request.query as { from?: string; to?: string };

      const rows = await reportQueries.getHoursByProject({ from, to });

      return { success: true, data: rows };
    },
  );

  // ─── CSV Export ──────────────────────────────────────────────────────────
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

      // Build CSV
      const header = 'Technician,Project,Address,Scheduled Date,Clock In,Clock Out,Break (min),Duration (hrs),Notes';
      const csvRows = rows.map((r) => {
        const escape = (s: string | null | undefined) => {
          if (!s) return '';
          const str = String(s);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        return [
          escape(r.technician_name),
          escape(r.project_name),
          escape(r.project_address),
          r.scheduled_date || '',
          r.clock_in,
          r.clock_out || '',
          r.break_minutes,
          r.duration_hours,
          escape(r.notes),
        ].join(',');
      });

      const csv = [header, ...csvRows].join('\n');

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="time-entries-${from || 'all'}-${to || 'all'}.csv"`);
      return reply.send(csv);
    },
  );
}
