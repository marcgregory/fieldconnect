/**
 * Programmatic factory functions for test entities.
 *
 * Each factory:
 *   - Writes directly via SQL (not via the API) for speed and determinism
 *   - Returns the inserted row
 *   - Supports overrides via the second argument
 *   - Refuses to run if the safety guard is not satisfied
 *
 * Factories do NOT broadcast WebSocket events or insert activity_events.
 * Use the API for that — factories are for setting up the data shape.
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { assertTestDbSafe } from './test-db';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    assertTestDbSafe();
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ─── Users ──────────────────────────────────────────────────────────────

export interface UserFactoryInput {
  email?: string;
  name?: string;
  role?: 'admin' | 'office_manager' | 'dispatcher' | 'field_technician';
  passwordHash?: string;
  emailVerified?: boolean;
}

export async function createUser(input: UserFactoryInput = {}): Promise<{
  id: string;
  email: string;
  name: string;
  role: string;
}> {
  const p = getPool();
  const id = randomUUID();
  const email = input.email ?? `user-${id.slice(0, 8)}@fieldconnect.test`;
  const name = input.name ?? 'Test User';
  const role = input.role ?? 'field_technician';
  const passwordHash =
    input.passwordHash ?? (await bcrypt.hash('test-password-123', 4));
  const verifiedAt = input.emailVerified ? new Date().toISOString() : null;

  const result = await p.query(
    `INSERT INTO users (id, email, name, password_hash, role, email_verified_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, name, role`,
    [id, email, name, passwordHash, role, verifiedAt],
  );
  return result.rows[0];
}

// ─── Projects ───────────────────────────────────────────────────────────

export interface ProjectFactoryInput {
  name?: string;
  description?: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
  status?: 'active' | 'completed' | 'on_hold' | 'cancelled';
  latitude?: number;
  longitude?: number;
  geofenceRadius?: number;
  createdBy: string;
}

export async function createProject(input: ProjectFactoryInput): Promise<{
  id: string;
  name: string;
  status: string;
}> {
  const p = getPool();
  const id = randomUUID();
  const name = input.name ?? `Test Project ${id.slice(0, 8)}`;

  const result = await p.query(
    `INSERT INTO projects (
       id, name, description, status, address, contact_name, contact_phone,
       latitude, longitude, geofence_radius, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, name, status`,
    [
      id,
      name,
      input.description ?? null,
      input.status ?? 'active',
      input.address ?? '123 Test St',
      input.contactName ?? 'Test Contact',
      input.contactPhone ?? '555-0100',
      input.latitude ?? null,
      input.longitude ?? null,
      input.geofenceRadius ?? 50,
      input.createdBy,
    ],
  );
  return result.rows[0];
}

// ─── Technician Assignments ─────────────────────────────────────────────

export async function assignTechnician(
  projectId: string,
  userId: string,
): Promise<{ id: string }> {
  const p = getPool();
  const result = await p.query(
    `INSERT INTO technician_assignments (project_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (project_id, user_id) DO UPDATE SET project_id = EXCLUDED.project_id
     RETURNING id`,
    [projectId, userId],
  );
  return result.rows[0];
}

// ─── Schedules ──────────────────────────────────────────────────────────

export interface ScheduleFactoryInput {
  projectId: string;
  technicianIds: string[];
  scheduledDate?: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  createdBy: string;
}

export async function createSchedule(input: ScheduleFactoryInput): Promise<{
  id: string;
  status: string;
  scheduled_date: string;
}> {
  const p = getPool();
  const id = randomUUID();
  const scheduledDate =
    input.scheduledDate ?? new Date().toISOString().slice(0, 10);

  const result = await p.query(
    `INSERT INTO schedules (
       id, project_id, scheduled_date, start_time, end_time, notes, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, status, scheduled_date`,
    [
      id,
      input.projectId,
      scheduledDate,
      input.startTime ?? '09:00',
      input.endTime ?? '17:00',
      input.notes ?? null,
      input.createdBy,
    ],
  );

  // Insert into schedule_technicians junction for each tech
  for (const techId of input.technicianIds) {
    await p.query(
      `INSERT INTO schedule_technicians (schedule_id, technician_id, status)
       VALUES ($1, $2, 'scheduled')`,
      [id, techId],
    );
  }

  return result.rows[0];
}

// ─── Time Entries ───────────────────────────────────────────────────────

export async function createTimeEntry(input: {
  userId: string;
  projectId: string;
  clockIn: Date;
  clockOut?: Date | null;
  breakMinutes?: number;
}): Promise<{ id: string }> {
  const p = getPool();
  const id = randomUUID();
  const result = await p.query(
    `INSERT INTO time_entries (
       id, user_id, project_id, clock_in, clock_out, break_minutes
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      id,
      input.userId,
      input.projectId,
      input.clockIn.toISOString(),
      input.clockOut?.toISOString() ?? null,
      input.breakMinutes ?? 0,
    ],
  );
  return result.rows[0];
}

// ─── Job Notes ──────────────────────────────────────────────────────────

export async function createNote(input: {
  scheduleId: string;
  userId: string;
  content: string;
  noteType?: 'technician' | 'internal';
  technicianId?: string | null;
  reworkVersion?: number;
}): Promise<{ id: string }> {
  const p = getPool();
  const id = randomUUID();
  const result = await p.query(
    `INSERT INTO job_notes (
       id, schedule_id, user_id, content, note_type, technician_id, rework_version
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      id,
      input.scheduleId,
      input.userId,
      input.content,
      input.noteType ?? 'technician',
      input.technicianId ?? null,
      input.reworkVersion ?? 0,
    ],
  );
  return result.rows[0];
}

// ─── Job Attachments ────────────────────────────────────────────────────

/**
 * Creates an attachment record. The Cloudinary URL is a placeholder
 * (https://res.cloudinary.com/test/...) when CLOUDINARY_PROVIDER=mock
 * is set; tests should not hit real Cloudinary.
 *
 * Schema: job_attachments has file_path (required, NOT cloudinary_url),
 * cloudinary_public_id, secure_url, attachment_type, etc. See
 * apps/api/src/db/migrations/007_create-job-attachments.sql and
 * apps/api/src/db/migrations/010_add-cloudinary.sql.
 */
export async function createAttachment(input: {
  scheduleId: string;
  userId: string;
  technicianId?: string | null;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  attachmentType?: 'before' | 'during' | 'after' | 'document';
  reworkVersion?: number;
  cloudinaryUrl?: string;
}): Promise<{ id: string; secure_url: string }> {
  const p = getPool();
  const id = randomUUID();
  const cloudinaryUrl =
    input.cloudinaryUrl ??
    `https://res.cloudinary.com/test/image/upload/v1/fieldconnect/jobs/${input.scheduleId}/${id}.jpg`;
  const filePath = `fieldconnect/jobs/${input.scheduleId}/${id}`;

  const result = await p.query(
    `INSERT INTO job_attachments (
       id, schedule_id, user_id, technician_id, file_name, file_path,
       mime_type, file_size, attachment_type, cloudinary_public_id, secure_url, rework_version
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, secure_url`,
    [
      id,
      input.scheduleId,
      input.userId,
      input.technicianId ?? null,
      input.fileName,
      filePath,
      input.mimeType ?? 'image/jpeg',
      input.fileSize ?? 1024,
      input.attachmentType ?? 'document',
      `fieldconnect/jobs/${input.scheduleId}/${id}`,
      cloudinaryUrl,
      input.reworkVersion ?? 0,
    ],
  );
  return result.rows[0];
}

// ─── Signatures ─────────────────────────────────────────────────────────

/**
 * Schema: signatures has signature_data (TEXT, base64 PNG data URL),
 * NOT cloudinary_url. We still populate cloudinary_public_id and
 * secure_url so completion-report.ts can embed the signature image.
 */
export async function createSignature(input: {
  scheduleId: string;
  userId: string;
  technicianId?: string | null;
  label?: string;
  reworkVersion?: number;
}): Promise<{ id: string; secure_url: string }> {
  const p = getPool();
  const id = randomUUID();
  const cloudinaryUrl = `https://res.cloudinary.com/test/image/upload/v1/fieldconnect/signatures/${input.scheduleId}/${id}.png`;
  // Minimal valid 1x1 PNG data URL (matches smoke-test.sh pattern)
  const signatureData =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const result = await p.query(
    `INSERT INTO signatures (
       id, schedule_id, user_id, technician_id, label, signature_data,
       cloudinary_public_id, secure_url, rework_version
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, secure_url`,
    [
      id,
      input.scheduleId,
      input.userId,
      input.technicianId ?? null,
      input.label ?? 'customer',
      signatureData,
      `fieldconnect/signatures/${input.scheduleId}/${id}`,
      cloudinaryUrl,
      input.reworkVersion ?? 0,
    ],
  );
  return result.rows[0];
}

// ─── Bulk Data Helpers (for Day 3 scale tests) ──────────────────────────

export async function bulkCreateNotes(
  scheduleId: string,
  userId: string,
  count: number,
): Promise<number> {
  const p = getPool();
  const values: string[] = [];
  const params: unknown[] = [];
  for (let i = 0; i < count; i++) {
    const offset = i * 4;
    values.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`,
    );
    params.push(
      randomUUID(),
      scheduleId,
      userId,
      `Bulk note #${i + 1} — auto-generated for scale testing.`,
    );
  }
  const result = await p.query(
    `INSERT INTO job_notes (id, schedule_id, user_id, content)
     VALUES ${values.join(', ')}`,
    params,
  );
  return result.rowCount ?? 0;
}

export async function bulkCreateAttachments(
  scheduleId: string,
  userId: string,
  count: number,
  technicianId: string | null = null,
): Promise<number> {
  const p = getPool();
  const values: string[] = [];
  const params: unknown[] = [];
  for (let i = 0; i < count; i++) {
    const offset = i * 9;
    const id = randomUUID();
    values.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`,
    );
    params.push(
      id,
      scheduleId,
      userId,
      technicianId,
      `bulk-${i + 1}.jpg`,
      `fieldconnect/jobs/${scheduleId}/${id}`,
      'image/jpeg',
      1024 * (i + 1),
      'document',
    );
  }
  const result = await p.query(
    `INSERT INTO job_attachments (
       id, schedule_id, user_id, technician_id, file_name, file_path,
       mime_type, file_size, attachment_type
     )
     VALUES ${values.join(', ')}
     RETURNING id`,
    params,
  );
  return result.rowCount ?? 0;
}

export async function bulkCreateAuditEvents(count: number): Promise<number> {
  const p = getPool();
  const values: string[] = [];
  const params: unknown[] = [];
  for (let i = 0; i < count; i++) {
    const offset = i * 3;
    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
    params.push(
      `bulk_test_event_${i}`,
      'system',
      JSON.stringify({ index: i, source: 'bulk_seed' }),
    );
  }
  const result = await p.query(
    `INSERT INTO auth_audit_logs (action, ip_address, metadata)
     VALUES ${values.join(', ')}`,
    params,
  );
  return result.rowCount ?? 0;
}
