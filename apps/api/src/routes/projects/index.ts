import type { FastifyInstance } from 'fastify';
import type { ProjectStatus } from '@fieldconnect/shared';
import {
  createProjectSchema,
  updateProjectSchema,
  updateProjectStatusSchema,
  assignTechnicianSchema,
} from '@fieldconnect/shared';
import { requireRole } from '../../middleware/auth';
import * as projectQueries from '../../db/queries/projects';
import * as technicianQueries from '../../db/queries/technicians';

export async function projectRoutes(app: FastifyInstance) {
  // ─── List Projects ──────────────────────────────────────────────────────
  app.get('/api/v1/projects', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const { status, search } = request.query as {
      status?: string;
      search?: string;
    };

    const projects = await projectQueries.findAll({
      status: status as any,
      search,
    });

    return { success: true, data: projects };
  });

  // ─── Create Project ─────────────────────────────────────────────────────
  app.post(
    '/api/v1/projects',
    { preHandler: [requireRole('admin', 'office_manager')] },
    async (request, reply) => {
      const parsed = createProjectSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: parsed.error.errors[0].message,
        });
      }

      const project = await projectQueries.create({
        ...parsed.data,
        created_by: request.user!.id,
      });

      return reply.status(201).send({ success: true, data: project });
    },
  );

  // ─── Get Project ────────────────────────────────────────────────────────
  app.get('/api/v1/projects/:id', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const { id } = request.params as { id: string };
    const project = await projectQueries.findById(id);

    if (!project) {
      return reply.status(404).send({ success: false, error: 'Project not found' });
    }

    return { success: true, data: project };
  });

  // ─── Update Project ─────────────────────────────────────────────────────
  app.put(
    '/api/v1/projects/:id',
    { preHandler: [requireRole('admin', 'office_manager')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateProjectSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: parsed.error.errors[0].message,
        });
      }

      const existing = await projectQueries.findById(id);
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Project not found' });
      }

      const project = await projectQueries.update(id, parsed.data);
      return { success: true, data: project };
    },
  );

  // ─── Update Project Status ──────────────────────────────────────────────
  app.patch(
    '/api/v1/projects/:id/status',
    { preHandler: [requireRole('admin', 'office_manager')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateProjectStatusSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: parsed.error.errors[0].message,
        });
      }

      const existing = await projectQueries.findById(id);
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Project not found' });
      }

      const project = await projectQueries.updateStatus(id, parsed.data.status as ProjectStatus);
      return { success: true, data: project };
    },
  );

  // ─── Assign Technician ──────────────────────────────────────────────────
  app.post(
    '/api/v1/projects/:id/assign',
    { preHandler: [requireRole('admin', 'office_manager')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = assignTechnicianSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: parsed.error.errors[0].message,
        });
      }

      const existing = await projectQueries.findById(id);
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Project not found' });
      }

      const assignment = await technicianQueries.assign(id, parsed.data.user_id);
      if (!assignment) {
        return reply.status(409).send({
          success: false,
          error: 'Technician is already assigned to this project',
        });
      }

      return reply.status(201).send({ success: true, data: assignment });
    },
  );

  // ─── Unassign Technician ────────────────────────────────────────────────
  app.delete(
    '/api/v1/projects/:id/assign/:userId',
    { preHandler: [requireRole('admin', 'office_manager')] },
    async (request, reply) => {
      const { id, userId } = request.params as { id: string; userId: string };

      const removed = await technicianQueries.unassign(id, userId);
      if (!removed) {
        return reply.status(404).send({
          success: false,
          error: 'Assignment not found',
        });
      }

      return { success: true, data: { removed: true } };
    },
  );

  // ─── List Assignments for Project ───────────────────────────────────────
  app.get('/api/v1/projects/:id/assignments', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const { id } = request.params as { id: string };
    const assignments = await technicianQueries.findAssignmentsByProject(id);

    return { success: true, data: assignments };
  });
}
