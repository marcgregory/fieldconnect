#!/usr/bin/env node
/**
 * Production migration runner.
 *
 * Runs pending SQL migrations against the DATABASE_URL from the environment
 * (Render's own env var, not a local .env file).  This script avoids the
 * dotenv-cli / node-pg-migrate naming-format issue that prevented migrations
 * 014–016 from applying on Render.
 *
 * Usage:
 *   node dist/migrate.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'src', 'db', 'migrations');

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
  });

  try {
    // Ensure the migrations tracking table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get all SQL files sorted by name
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    // Get already-applied migrations
    const { rows: applied } = await pool.query(
      'SELECT name FROM migrations ORDER BY name'
    );
    const appliedSet = new Set(applied.map((r: { name: string }) => r.name));

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  ✅ ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`  ▶  Applying ${file}...`);

      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        await pool.query('COMMIT');
        console.log(`  ✅ ${file} done`);
      } catch (err: unknown) {
        await pool.query('ROLLBACK');
        console.error(`  ❌ ${file} FAILED:`, (err as Error).message);
        throw err;
      }
    }

    console.log('All migrations up to date.');
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});
