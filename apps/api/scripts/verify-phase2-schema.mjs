#!/usr/bin/env node
/**
 * Verify the Phase 2 schema is fully present.
 *   - users.email_verified_at column exists
 *   - verification_tokens, auth_audit_logs, rate_limit_events tables exist
 */
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
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

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
try {
  const c = await pool.connect();
  try {
    // 1. users.email_verified_at
    const col = await c.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema='public' AND table_name='users' AND column_name='email_verified_at'`,
    );
    console.log(col.rowCount === 1
      ? `✓ users.email_verified_at exists (${col.rows[0].data_type})`
      : '✗ users.email_verified_at MISSING');

    // 2. Required tables
    const tables = ['verification_tokens', 'auth_audit_logs', 'rate_limit_events'];
    for (const t of tables) {
      const r = await c.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema='public' AND table_name=$1`,
        [t],
      );
      console.log(r.rowCount === 1 ? `✓ ${t} exists` : `✗ ${t} MISSING`);
    }

    // 3. Indexes
    const expectedIdx = [
      'idx_verification_tokens_hash',
      'idx_verification_tokens_user',
      'idx_verification_tokens_expires',
      'idx_auth_audit_user',
      'idx_auth_audit_action',
      'idx_auth_audit_created',
      'idx_rate_limit_scope',
      'idx_rate_limit_window',
    ];
    const idxResult = await c.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname='public' AND indexname = ANY($1::text[])`,
      [expectedIdx],
    );
    const present = new Set(idxResult.rows.map((r) => r.indexname));
    for (const i of expectedIdx) {
      console.log(present.has(i) ? `✓ index ${i}` : `✗ index ${i} MISSING`);
    }
  } finally {
    c.release();
  }
} finally {
  await pool.end();
}
