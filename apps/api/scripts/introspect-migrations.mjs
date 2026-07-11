#!/usr/bin/env node
/**
 * Read-only introspection of the two migration tables. Used to decide
 * whether the reconcile script needs to run, and to document state.
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
    for (const tbl of ['pgmigrations', 'migrations']) {
      const r = await c.query(
        `SELECT to_regclass('public.${tbl}') AS exists`,
      );
      if (!r.rows[0].exists) {
        console.log(`[${tbl}] does not exist.`);
        continue;
      }
      // Discover columns first so we don't hard-code names.
      const cols = await c.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1
         ORDER BY ordinal_position`,
        [tbl],
      );
      const colNames = cols.rows.map((r) => r.column_name);
      const select = colNames.join(', ');
      const rows = await c.query(`SELECT ${select} FROM ${tbl} ORDER BY 1`);
      console.log(`[${tbl}] columns: ${colNames.join(', ')} | ${rows.rowCount} rows:`);
      for (const row of rows.rows) {
        console.log(' ', row);
      }
    }
  } finally {
    c.release();
  }
} finally {
  await pool.end();
}
