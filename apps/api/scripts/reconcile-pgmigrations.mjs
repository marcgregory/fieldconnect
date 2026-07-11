#!/usr/bin/env node
/**
 * One-off reconciliation (Sprint 6, Phase 2).
 *
 * Background
 * ----------
 * As of 2026-07-11, the database had a fully-built public schema (every
 * table from 001-024 present) but the dev migration runner's `pgmigrations`
 * tracking table was empty. This meant `pnpm db:migrate` tried to re-apply
 * 001-024, which failed on `CREATE TABLE users` because the table already
 * existed.
 *
 * The `migrations` table (used by the production runner `migrate.ts`) is
 * also empty in this database, so the schema — not a tracking table — is
 * the only source of truth.
 *
 * What this script does
 * ---------------------
 * 1. Verifies every table that migrations 001-024 should have created is
 *    present. Refuses to run if any are missing (would silently skip a
 *    migration we actually need to apply).
 * 2. Backfills `pgmigrations` with rows for 001-024, marking them as
 *    already applied. Wrapped in a single transaction.
 * 3. Hands off to `node-pg-migrate` to apply 025-028 normally.
 *
 * Safety
 * ------
 *  - Aborts if `pgmigrations` is non-empty (operator must inspect).
 *  - Aborts if any expected table is missing.
 *  - Backfill is a single transaction; the node-pg-migrate step is separate
 *    so if it fails, the operator can re-run this script safely — the
 *    `IF NOT EXISTS` style logic isn't used, so a second run hits the
 *    non-empty guard.
 *
 * Usage
 * -----
 *   node apps/api/scripts/reconcile-pgmigrations.mjs
 *
 * One-time use. After the migration is complete, prefer `pnpm db:migrate`
 * going forward.
 */

import { Pool } from 'pg';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// dotenv-cli only injects env into the child process it spawns, not into
// this script. Load DATABASE_URL from the repo-root .env directly.
function loadEnv() {
  if (process.env.DATABASE_URL) return;
  const envPath = join(__dirname, '..', '..', '..', '.env');
  try {
    const text = readFileSync(envPath, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) {
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        process.env[m[1]] = v;
      }
    }
  } catch {}
}
loadEnv();

// Canonical list of migrations 001-024. Names match the file stems
// exactly (without the .sql extension). Order matters only for
// readability — the script inserts them all at once.
const APPLIED_MIGRATIONS = [
  '001_create-users',
  '002_create-projects',
  '003_create-schedules',
  '003_create-time-entries',
  '004_create-technician-assignments',
  '005_create-audit-logs',
  '006_create-job-notes',
  '007_create-job-attachments',
  '008_create-signatures',
  '009_remove_office_review',
  '010_add-cloudinary',
  '011_add-gps-fields',
  '012_add-gps-accuracy',
  '013_add-photo-geotagging',
  '014_multi_technician_schedules',
  '015_add_geofence_action',
  '016_create_refresh_tokens',
  '017_ensure_schedule_technicians',
  '018_create-rework-requests',
  '019_add-rework-version',
  '020_add-rework-status-constraint',
  '021_add-per-technician-workflow',
  '022_add_technician_id_to_evidence',
  '023_create-activity-events',
  '024_add-activity-retention',
];

// Tables each migration should have created. Only migrations that
// CREATE TABLE (rather than ALTER) appear here — column-only migrations
// are not introspected because we don't have a portable way to assert
// the absence of an old column.
const EXPECTED_TABLES = {
  '001_create-users':                       'users',
  '002_create-projects':                    'projects',
  '003_create-schedules':                   'schedules',
  '003_create-time-entries':                'time_entries',
  '004_create-technician-assignments':      'technician_assignments',
  '005_create-audit-logs':                  'audit_logs',
  '006_create-job-notes':                   'job_notes',
  '007_create-job-attachments':             'job_attachments',
  '008_create-signatures':                  'signatures',
  '014_multi_technician_schedules':         'schedule_technicians',
  '016_create_refresh_tokens':              'refresh_tokens',
  '018_create-rework-requests':             'rework_requests',
  '023_create-activity-events':             'activity_events',
};

async function tableExists(client, name) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [name],
  );
  return r.rowCount > 0;
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 5000,
  });

  try {
    const client = await pool.connect();
    try {
      // 1. Refuse if pgmigrations is non-empty. Operator must inspect.
      const r = await client.query(
        `SELECT to_regclass('public.pgmigrations') AS exists`,
      );
      if (r.rows[0].exists) {
        const count = await client.query('SELECT COUNT(*)::int AS n FROM pgmigrations');
        if (count.rows[0].n > 0) {
          throw new Error(
            `pgmigrations already has ${count.rows[0].n} rows. This script is only for the empty-table case. Inspect manually.`,
          );
        }
        console.log('[reconcile] pgmigrations exists but is empty (created by the earlier failed db:migrate run).');
      } else {
        console.log('[reconcile] pgmigrations does not exist. Will create it.');
      }

      // 2. Verify schema. Every expected table must exist.
      const missing = [];
      for (const [mig, tbl] of Object.entries(EXPECTED_TABLES)) {
        if (!(await tableExists(client, tbl))) missing.push(`${mig} → ${tbl}`);
      }
      if (missing.length > 0) {
        throw new Error(
          'Schema is incomplete. These expected tables are missing:\n  ' +
            missing.join('\n  ') +
            '\nThis script assumes migrations 001-024 have already been applied. ' +
            'If they have not, run `pnpm db:migrate` against a clean database instead.',
        );
      }
      console.log(`[reconcile] Schema check passed (${Object.keys(EXPECTED_TABLES).length} tables present).`);

      // 3. Backfill pgmigrations in a single transaction.
      await client.query('BEGIN');
      if (!r.rows[0].exists) {
        await client.query(`
          CREATE TABLE pgmigrations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            run_on TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
      }
      for (const name of APPLIED_MIGRATIONS) {
        await client.query(
          'INSERT INTO pgmigrations (name, run_on) VALUES ($1, NOW())',
          [name],
        );
      }
      // 4. Sanity check: the new Phase 2 migrations must not be present.
      const premature = await client.query(
        `SELECT name FROM pgmigrations WHERE name IN (
           '025_add-email-verified-at',
           '026_create-verification-tokens',
           '027_create-auth-audit-logs',
           '028_create-rate-limit-events'
         )`,
      );
      if (premature.rowCount > 0) {
        await client.query('ROLLBACK');
        throw new Error(
          'pgmigrations already contains one of 025-028. Aborting backfill so the operator can decide.',
        );
      }
      await client.query('COMMIT');
      console.log(`[reconcile] Backfilled pgmigrations with ${APPLIED_MIGRATIONS.length} rows.`);

      // 5. Quick post-backfill sanity read.
      const after = await client.query('SELECT COUNT(*)::int AS n FROM pgmigrations');
      console.log(`[reconcile] pgmigrations now has ${after.rows[0].n} rows.`);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  // 6. Hand off to node-pg-migrate to apply 025-028. Pass process.env so
  //    the runner can reach DATABASE_URL via dotenv-cli.
  console.log('[reconcile] Handing off to node-pg-migrate for 025-028...');
  execSync(
    'npx --yes dotenv-cli -e ../../.env -- node ./node_modules/node-pg-migrate/bin/node-pg-migrate.js up --migration-file-language sql --migrations-dir ./src/db/migrations --no-envfile',
    {
      stdio: 'inherit',
      cwd: join(__dirname, '..'),
      env: process.env,
    },
  );

  console.log('[reconcile] Done. Migration history is now consistent.');
}

main().catch((err) => {
  console.error('[reconcile] FAILED:', err.message);
  process.exit(1);
});
