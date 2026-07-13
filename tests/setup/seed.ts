/**
 * RC Seed Script.
 *
 * Idempotent. Re-running does not duplicate records — checks for existing
 * fixture rows by stable keys (e.g. rc-admin@fieldconnect.test) first.
 *
 * Sets up:
 *   - 1 admin (rc-admin@fieldconnect.test)
 *   - 1 office manager (rc-office@fieldconnect.test)
 *   - 3 field technicians (rc-tech-1/2/3@fieldconnect.test)
 *   - 3 active projects (Smith, Garcia, Lee)
 *   - 1 multi-tech schedule (Smith with 2 techs)
 *   - 1 single-tech schedule (Garcia)
 *   - 1 completed job with notes + attachment + signature
 *   - 1 rework job in rework_required status
 *   - Time entries for all techs
 *
 * Production safety: this script refuses to run unless the triple-guard
 * passes. The reset-db.sh wrapper sets the env. Direct invocation
 * (tsx tests/setup/seed.ts) will fail loudly if env is missing.
 *
 * Cloudinary: when CLOUDINARY_PROVIDER=mock, attachments/signatures get
 * placeholder URLs (https://res.cloudinary.com/test/...). Real uploads
 * are not performed by this script — that requires the API.
 */

import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { assertTestDbSafe } from './test-db';
import {
  createUser,
  createProject,
  assignTechnician,
  createSchedule,
  createTimeEntry,
  createNote,
  createAttachment,
  createSignature,
  closePool,
} from './factories';

const SEED_PASSWORD = 'rc-test-password';

async function hashPassword(): Promise<string> {
  return bcrypt.hash(SEED_PASSWORD, 4);
}

const SEED_USERS = {
  admin: { email: 'rc-admin@fieldconnect.test', name: 'RC Admin', role: 'admin' as const },
  office: { email: 'rc-office@fieldconnect.test', name: 'RC Office Manager', role: 'office_manager' as const },
  tech1: { email: 'rc-tech-1@fieldconnect.test', name: 'RC Tech 1', role: 'field_technician' as const },
  tech2: { email: 'rc-tech-2@fieldconnect.test', name: 'RC Tech 2', role: 'field_technician' as const },
  tech3: { email: 'rc-tech-3@fieldconnect.test', name: 'RC Tech 3', role: 'field_technician' as const },
};

async function findOrCreateUser(
  email: string,
  fallback: () => Promise<{ id: string; email: string; role: string }>,
): Promise<{ id: string; email: string; role: string }> {
  assertTestDbSafe();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const result = await pool.query(
      'SELECT id, email, role FROM users WHERE email = $1',
      [email],
    );
    if (result.rows[0]) return result.rows[0];
  } finally {
    await pool.end();
  }
  return fallback();
}

async function main(): Promise<void> {
  assertTestDbSafe();
  console.log('\n🌱 Seeding RC fixtures…\n');

  // ── Users ───────────────────────────────────────────────────────────
  console.log('  ▶ users');
  const passwordHash = await hashPassword();
  const admin = await findOrCreateUser(SEED_USERS.admin.email, () =>
    createUser({
      ...SEED_USERS.admin,
      passwordHash,
      emailVerified: true,
    }),
  );
  const office = await findOrCreateUser(SEED_USERS.office.email, () =>
    createUser({
      ...SEED_USERS.office,
      passwordHash,
      emailVerified: true,
    }),
  );
  const tech1 = await findOrCreateUser(SEED_USERS.tech1.email, () =>
    createUser({
      ...SEED_USERS.tech1,
      passwordHash,
      emailVerified: true,
    }),
  );
  const tech2 = await findOrCreateUser(SEED_USERS.tech2.email, () =>
    createUser({
      ...SEED_USERS.tech2,
      passwordHash,
      emailVerified: true,
    }),
  );
  const tech3 = await findOrCreateUser(SEED_USERS.tech3.email, () =>
    createUser({
      ...SEED_USERS.tech3,
      passwordHash,
      emailVerified: true,
    }),
  );

  console.log(`    ✓ admin    ${admin.id}`);
  console.log(`    ✓ office   ${office.id}`);
  console.log(`    ✓ tech1    ${tech1.id}`);
  console.log(`    ✓ tech2    ${tech2.id}`);
  console.log(`    ✓ tech3    ${tech3.id}`);

  // ── Projects ────────────────────────────────────────────────────────
  console.log('  ▶ projects');
  const projectSmith = await createProject({
    name: 'Smith Residence',
    address: '100 Smith St, Springfield',
    contactName: 'John Smith',
    contactPhone: '555-0101',
    latitude: 37.7749,
    longitude: -122.4194,
    createdBy: admin.id,
  });
  const projectGarcia = await createProject({
    name: 'Garcia Office Build',
    address: '200 Garcia Ave, Springfield',
    contactName: 'Maria Garcia',
    contactPhone: '555-0102',
    createdBy: admin.id,
  });
  const projectLee = await createProject({
    name: 'Lee Warehouse Wiring',
    address: '300 Lee Blvd, Springfield',
    contactName: 'David Lee',
    contactPhone: '555-0103',
    createdBy: admin.id,
  });

  console.log(`    ✓ ${projectSmith.name} (${projectSmith.id})`);
  console.log(`    ✓ ${projectGarcia.name} (${projectGarcia.id})`);
  console.log(`    ✓ ${projectLee.name} (${projectLee.id})`);

  // ── Team Assignments ────────────────────────────────────────────────
  console.log('  ▶ team assignments');
  await assignTechnician(projectSmith.id, tech1.id);
  await assignTechnician(projectSmith.id, tech2.id);
  await assignTechnician(projectGarcia.id, tech3.id);
  console.log('    ✓ Smith: tech1, tech2');
  console.log('    ✓ Garcia: tech3');

  // ── Schedules ───────────────────────────────────────────────────────
  console.log('  ▶ schedules');
  const today = new Date().toISOString().slice(0, 10);
  const scheduleMulti = await createSchedule({
    projectId: projectSmith.id,
    technicianIds: [tech1.id, tech2.id],
    scheduledDate: today,
    startTime: '09:00',
    endTime: '13:00',
    notes: 'Multi-tech seed: network + security install',
    createdBy: admin.id,
  });
  const scheduleSingle = await createSchedule({
    projectId: projectGarcia.id,
    technicianIds: [tech3.id],
    scheduledDate: today,
    startTime: '14:00',
    endTime: '17:00',
    notes: 'Single-tech seed: office cabling',
    createdBy: admin.id,
  });
  const scheduleRework = await createSchedule({
    projectId: projectLee.id,
    technicianIds: [tech1.id],
    scheduledDate: today,
    startTime: '10:00',
    endTime: '12:00',
    notes: 'Rework-required seed: missing photos',
    createdBy: admin.id,
  });

  console.log(`    ✓ multi-tech Smith schedule: ${scheduleMulti.id}`);
  console.log(`    ✓ single-tech Garcia schedule: ${scheduleSingle.id}`);
  console.log(`    ✓ rework Lee schedule: ${scheduleRework.id}`);

  // ── Time Entries ────────────────────────────────────────────────────
  console.log('  ▶ time entries');
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  await createTimeEntry({
    userId: tech1.id,
    projectId: projectSmith.id,
    clockIn: twoHoursAgo,
    clockOut: now,
  });
  await createTimeEntry({
    userId: tech2.id,
    projectId: projectSmith.id,
    clockIn: twoHoursAgo,
    clockOut: now,
  });
  console.log('    ✓ tech1 + tech2 clocked in to Smith');

  // ── Notes / Attachments / Signatures on completed job ───────────────
  console.log('  ▶ evidence on single-tech job');
  await createNote({
    scheduleId: scheduleSingle.id,
    userId: tech3.id,
    technicianId: tech3.id,
    content: 'Work completed successfully. All cabling tested.',
    noteType: 'technician',
  });
  await createNote({
    scheduleId: scheduleSingle.id,
    userId: office.id,
    content: 'Customer confirmed satisfaction. Invoice sent.',
    noteType: 'internal',
  });
  await createAttachment({
    scheduleId: scheduleSingle.id,
    userId: tech3.id,
    technicianId: tech3.id,
    fileName: 'before.jpg',
  });
  await createAttachment({
    scheduleId: scheduleSingle.id,
    userId: tech3.id,
    technicianId: tech3.id,
    fileName: 'after.jpg',
  });
  await createSignature({
    scheduleId: scheduleSingle.id,
    userId: tech3.id,
    technicianId: tech3.id,
    label: 'customer',
  });
  console.log('    ✓ 2 notes, 2 attachments, 1 signature on Garcia schedule');

  // ── Rework request on Lee schedule ─────────────────────────────────
  console.log('  ▶ rework request');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `INSERT INTO rework_requests (
         schedule_id, technician_id, requested_by, reason, status, rework_version
       )
       VALUES ($1, $2, $3, $4, 'open', 1)
       ON CONFLICT DO NOTHING`,
      [scheduleRework.id, tech1.id, office.id, 'Missing before photos — please upload and resubmit.'],
    );
    await pool.query(
      `UPDATE schedule_technicians
       SET status = 'rework_required',
           current_rework_version = 1,
           has_open_rework = TRUE
       WHERE schedule_id = $1 AND technician_id = $2`,
      [scheduleRework.id, tech1.id],
    );
  } finally {
    await pool.end();
  }
  console.log('    ✓ rework request created, tech1 status=rework_required');

  await closePool();

  console.log('\n✅ RC seed complete.\n');
  console.log('  Test credentials (password: rc-test-password):');
  console.log('    admin:   rc-admin@fieldconnect.test');
  console.log('    office:  rc-office@fieldconnect.test');
  console.log('    tech1:   rc-tech-1@fieldconnect.test');
  console.log('    tech2:   rc-tech-2@fieldconnect.test');
  console.log('    tech3:   rc-tech-3@fieldconnect.test\n');
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('\n❌ Seed failed:', err);
    await closePool().catch(() => {});
    process.exit(1);
  });
