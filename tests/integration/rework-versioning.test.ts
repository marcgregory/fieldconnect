import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp, authedInject, makeUser } from '../helpers/app';
import { assertTestDbSafe } from '../setup/test-db';
import {
  assignTechnician,
  closePool,
  createNote,
  createProject,
  createSchedule,
  createUser,
} from '../setup/factories';

describe('rework evidence versioning', () => {
  let app: FastifyInstance;
  let pool: Pool;

  beforeAll(async () => {
    assertTestDbSafe();
    app = await getTestApp();
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  });

  afterAll(async () => {
    await pool.end();
    await closePool();
    await closeTestApp();
  });

  it('uses version 1 for one rework request and does not increment on complete', async () => {
    const admin = await createUser({ role: 'admin', name: 'Test Admin', emailVerified: true });
    const tech = await createUser({ role: 'field_technician', name: 'Test Tech', emailVerified: true });
    const project = await createProject({ name: 'Versioned Rework Project', createdBy: admin.id });
    await assignTechnician(project.id, tech.id);
    const schedule = await createSchedule({
      projectId: project.id,
      technicianIds: [tech.id],
      createdBy: admin.id,
    });

    await createNote({
      scheduleId: schedule.id,
      userId: tech.id,
      technicianId: tech.id,
      content: 'done',
      noteType: 'technician',
      reworkVersion: 0,
    });
    await pool.query(
      "UPDATE schedule_technicians SET status = 'completed', completed_at = NOW() WHERE schedule_id = $1 AND technician_id = $2",
      [schedule.id, tech.id],
    );

    const adminUser = makeUser({ id: admin.id, role: 'admin', name: admin.name });
    const techUser = makeUser({ id: tech.id, role: 'field_technician', name: tech.name });

    const request = await authedInject(
      app,
      'POST',
      '/api/v1/schedules/' + schedule.id + '/rework',
      adminUser,
      { reason: 'Fix note', technician_id: tech.id },
    );
    expect(request.statusCode).toBe(201);
    const requestBody = request.json();
    const reworkId = requestBody.data.rework.id;
    expect(requestBody.data.rework.rework_version).toBe(1);

    let workflow = await pool.query(
      "SELECT current_rework_version, has_open_rework FROM schedule_technicians WHERE schedule_id = $1 AND technician_id = $2",
      [schedule.id, tech.id],
    );
    expect(workflow.rows[0].current_rework_version).toBe(1);
    expect(workflow.rows[0].has_open_rework).toBe(true);

    const resume = await authedInject(
      app,
      'PATCH',
      '/api/v1/schedules/' + schedule.id + '/rework/' + reworkId + '/resume',
      techUser,
      {},
    );
    expect(resume.statusCode).toBe(200);

    const reworkNote = await authedInject(
      app,
      'POST',
      '/api/v1/schedules/' + schedule.id + '/notes',
      techUser,
      { content: 'done', note_type: 'technician' },
    );
    expect(reworkNote.statusCode).toBe(201);
    expect(reworkNote.json().data.rework_version).toBe(1);

    const complete = await authedInject(
      app,
      'PATCH',
      '/api/v1/schedules/' + schedule.id + '/rework/' + reworkId + '/complete',
      adminUser,
      { technician_id: tech.id },
    );
    expect(complete.statusCode).toBe(200);

    workflow = await pool.query(
      "SELECT current_rework_version, has_open_rework FROM schedule_technicians WHERE schedule_id = $1 AND technician_id = $2",
      [schedule.id, tech.id],
    );
    expect(workflow.rows[0].current_rework_version).toBe(1);
    expect(workflow.rows[0].has_open_rework).toBe(false);

    const evidence = await pool.query(
      "SELECT content, rework_version FROM job_notes WHERE schedule_id = $1 AND technician_id = $2 ORDER BY created_at ASC",
      [schedule.id, tech.id],
    );
    expect(evidence.rows.map((row) => row.rework_version)).toEqual([0, 1]);
    expect(evidence.rows.map((row) => row.content)).toEqual(['done', 'done']);

    const history = await pool.query(
      "SELECT rework_version, status FROM rework_requests WHERE schedule_id = $1 AND technician_id = $2",
      [schedule.id, tech.id],
    );
    expect(history.rows).toEqual([{ rework_version: 1, status: 'completed' }]);
  });
});
