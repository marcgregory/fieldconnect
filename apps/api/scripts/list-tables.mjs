#!/usr/bin/env node
/**
 * List every table in the public schema. Used to confirm the live schema
 * matches what migrations 001-024 would have created.
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
    const r = await c.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log(`Tables in public schema (${r.rowCount}):`);
    for (const row of r.rows) console.log('  ' + row.table_name);
  } finally {
    c.release();
  }
} finally {
  await pool.end();
}
