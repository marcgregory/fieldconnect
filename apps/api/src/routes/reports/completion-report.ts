import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/auth';
import { getCompletionReport } from '../../db/queries/completion-report';
import { generateCompletionReportPdf } from '../../lib/pdf-report';

export async function completionReportRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/reports/completion/:scheduleId
   * Returns a PDF customer completion report for the given schedule.
   * Restricted to office staff (admin, office_manager, dispatcher).
   */
  app.get(
    '/api/v1/reports/completion/:scheduleId',
    { preHandler: [requireRole('admin', 'office_manager', 'dispatcher')] },
    async (request, reply) => {
      const { scheduleId } = request.params as { scheduleId: string };

      try {
        const data = await getCompletionReport(scheduleId);
        const pdfBuffer = generateCompletionReportPdf(data);

        const safeName = data.project.name
          .replace(/[^a-zA-Z0-9\s\-_\.]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 40) || 'report';

        reply.header('Content-Type', 'application/pdf');
        reply.header(
          'Content-Disposition',
          `attachment; filename="completion-report-${safeName}.pdf"`,
        );
        reply.header('Content-Length', String(pdfBuffer.length));
        reply.header('Cache-Control', 'no-store');

        return reply.send(pdfBuffer);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate report';

        if (message === 'Schedule not found') {
          return reply.status(404).send({ success: false, error: message });
        }

        // Log the full error with schedule context for debugging
        request.log.error({ err, scheduleId }, 'Completion PDF generation failed');

        return reply.status(500).send({
          success: false,
          error: 'Failed to generate completion report',
          requestId: request.id,
        });
      }
    },
  );
}
