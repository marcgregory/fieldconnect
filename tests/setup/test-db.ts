/**
 * Test database setup with triple-guard.
 *
 * Triple-guard prevents accidental destructive operations against any
 * non-test database. The setup will ABORT immediately if any guard fails.
 *
 * Required environment for any code path that drops/creates the test DB:
 *   1. NODE_ENV === 'test'
 *   2. ALLOW_TEST_DB === '1'
 *   3. DATABASE_URL points to localhost and db name contains '_rc' or '_test'
 *
 * If any guard fails, `assertTestDbSafe` throws a `TestGuardError`. The
 * entry-point wrapper (`runOrExit`, `reset-db.sh`) catches it, prints a
 * friendly message, and exits with code 2 — BEFORE running any DROP,
 * CREATE, migration, or seed logic.
 *
 * Wrapped scripts (e.g. scripts/rc/reset-db.sh) must set NODE_ENV and
 * ALLOW_TEST_DB before invoking. Direct invocations without the wrapper
 * will hit the guards and abort.
 *
 * Test design:
 *   The throw-based design makes the guard naturally testable. Tests
 *   call `expect(() => assertTestDbSafe()).toThrow(TestGuardError)` and
 *   assert on the typed error.
 *
 * Usage (from inside Vitest or scripts/rc/reset-db.sh):
 *   import { assertTestDbSafe, ensureTestDatabase } from './tests/setup/test-db';
 *   assertTestDbSafe();
 *   await ensureTestDatabase();
 */

import { Pool } from 'pg';
import path from 'path';

const REQUIRED_NODE_ENV = 'test';
const REQUIRED_ALLOW_FLAG = '1';
const DB_NAME_HINT = /(_rc|_test)$/i;

export class TestGuardError extends Error {
  public readonly guard: 'NODE_ENV' | 'ALLOW_TEST_DB' | 'DATABASE_URL';
  public readonly failures: string[];
  public readonly parsed: ParsedDbUrl | null;
  constructor(
    message: string,
    guard: 'NODE_ENV' | 'ALLOW_TEST_DB' | 'DATABASE_URL',
    failures: string[],
    parsed: ParsedDbUrl | null,
  ) {
    super(message);
    this.name = 'TestGuardError';
    this.guard = guard;
    this.failures = failures;
    this.parsed = parsed;
  }
}

interface ParsedDbUrl {
  host: string;
  database: string;
  port: string;
  user: string;
  password: string;
}

/**
 * Parse a Postgres connection URL into its component parts. Throws if the
 * URL is malformed. We do NOT use the URL constructor because Postgres URLs
 * can contain percent-encoded passwords.
 */
export function parseDbUrl(url: string): ParsedDbUrl {
  // Format: postgres://user:password@host:port/database?params
  const match = url.match(
    /^postgres(?:ql)?:\/\/([^:@/]+)(?::([^@/]*))?@([^:/]+)(?::(\d+))?\/([^?]+)(?:\?.*)?$/,
  );
  if (!match) {
    throw new Error(`Malformed DATABASE_URL: cannot parse`);
  }
  const [, user, password = '', host, port = '5432', database] = match;
  return { user, password, host, port, database };
}

/**
 * Verify the three guards. Throws a `TestGuardError` if any guard fails.
 * Does NOT call process.exit — that responsibility belongs to the
 * entry-point wrapper (runOrExit, reset-db.sh). This makes the function
 * naturally testable: `expect(() => assertTestDbSafe()).toThrow()`.
 */
export function assertTestDbSafe(dbUrl: string = process.env.DATABASE_URL ?? ''): void {
  if (!dbUrl) {
    throw new TestGuardError(
      'DATABASE_URL is not set.',
      'DATABASE_URL',
      ['DATABASE_URL is not set.'],
      null,
    );
  }

  const nodeEnv = process.env.NODE_ENV;
  const allow = process.env.ALLOW_TEST_DB;

  const failures: string[] = [];

  if (nodeEnv !== REQUIRED_NODE_ENV) {
    failures.push(
      `NODE_ENV must be "${REQUIRED_NODE_ENV}", got "${nodeEnv ?? '<unset>'}".`,
    );
  }

  if (allow !== REQUIRED_ALLOW_FLAG) {
    failures.push(
      `ALLOW_TEST_DB must be "1", got "${allow ?? '<unset>'}". Set via: scripts/rc/reset-db.sh or export ALLOW_TEST_DB=1`,
    );
  }

  let parsed: ParsedDbUrl | null = null;
  try {
    parsed = parseDbUrl(dbUrl);
  } catch (err) {
    failures.push(`DATABASE_URL could not be parsed: ${(err as Error).message}`);
    throw new TestGuardError(
      'Test database guard failed: ' + failures.join('; '),
      'DATABASE_URL',
      failures,
      null,
    );
  }

  if (parsed.host !== 'localhost' && parsed.host !== '127.0.0.1') {
    failures.push(
      `DATABASE_URL host must be localhost or 127.0.0.1, got "${parsed.host}".`,
    );
  }

  if (!DB_NAME_HINT.test(parsed.database)) {
    failures.push(
      `DATABASE_URL database name must end in _rc or _test, got "${parsed.database}".`,
    );
  }

  if (failures.length > 0) {
    throw new TestGuardError(
      'Test database guard failed: ' + failures.join('; '),
      'DATABASE_URL',
      failures,
      parsed,
    );
  }
}

function maskPassword(url: string): string {
  return url.replace(/:[^:@/]*@/, ':***@');
}

function printFailure(err: TestGuardError): void {
  console.error('\n❌ RC test database guard FAILED.\n');
  console.error('Refusing to run DROP/CREATE/migrate/seed on this database.\n');
  console.error('Failures:');
  for (const f of err.failures) console.error(`  • ${f}`);
  console.error('\nResolved target:');
  if (err.parsed) {
    console.error(`  host:     ${err.parsed.host}`);
    console.error(`  port:     ${err.parsed.port}`);
    console.error(`  database: ${err.parsed.database}`);
    console.error(`  user:     ${err.parsed.user}`);
  } else {
    console.error(`  (unparseable URL)`);
  }
  console.error('\nRequired environment:');
  console.error('  NODE_ENV=test');
  console.error('  ALLOW_TEST_DB=1');
  console.error('  DATABASE_URL must point to localhost and end in _rc or _test');
  console.error('\nUse scripts/rc/reset-db.sh to set the environment and reset.');
  console.error('Do NOT set ALLOW_TEST_DB=1 in shared production env files.\n');
}

/**
 * Entry point for CLI scripts. Calls assertTestDbSafe, prints a friendly
 * error on failure, and exits with code 2. Use this from any script that
 * has already been wrapped with the env vars set.
 */
export function runOrExit(): void {
  try {
    assertTestDbSafe();
  } catch (err) {
    if (err instanceof TestGuardError) {
      printFailure(err);
    } else {
      console.error('Unexpected guard error:', err);
    }
    process.exit(2);
  }
}

/**
 * Drop, recreate, and migrate the test database. Idempotent: safe to call
 * multiple times. Uses a separate "admin" pool (connected to the default
 * `postgres` database) to issue DROP/CREATE, then closes it and runs
 * migrations via a fresh pool against the test DB.
 */
export async function ensureTestDatabase(): Promise<void> {
  assertTestDbSafe();
  const dbUrl = process.env.DATABASE_URL!;
  const parsed = parseDbUrl(dbUrl);
  const adminDbUrl = dbUrl.replace(`/${parsed.database}`, '/postgres');

  console.log(`\n🔧 Resetting test database "${parsed.database}" on ${parsed.host}:${parsed.port}…\n`);

  const adminPool = new Pool({ connectionString: adminDbUrl, max: 1 });

  try {
    // Force-disconnect any other clients before dropping
    await adminPool.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [parsed.database],
    );

    await adminPool.query(`DROP DATABASE IF EXISTS "${parsed.database}"`);
    console.log(`  ✓ dropped "${parsed.database}"`);

    await adminPool.query(`CREATE DATABASE "${parsed.database}"`);
    console.log(`  ✓ created "${parsed.database}"`);
  } finally {
    await adminPool.end();
  }

  // Run migrations against the freshly-created DB
  const migrationsDir = path.resolve(__dirname, '..', '..', 'apps', 'api', 'src', 'db', 'migrations');
  console.log(`\n  ▶  Applying migrations from ${migrationsDir}…\n`);

  const appPool = new Pool({ connectionString: dbUrl, max: 1 });
  try {
    await appPool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const fs = require('fs') as typeof import('fs');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      process.stdout.write(`  ▶  ${file} ... `);
      await appPool.query('BEGIN');
      try {
        await appPool.query(sql);
        await appPool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        await appPool.query('COMMIT');
        process.stdout.write('✓\n');
      } catch (err) {
        await appPool.query('ROLLBACK');
        process.stdout.write('✗\n');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await appPool.end();
  }

  console.log(`\n✅ Test database "${parsed.database}" is ready.\n`);
}

// Allow direct execution: `tsx tests/setup/test-db.ts reset`
// In ESM, `require.main` is unavailable; use import.meta.url to detect entry.
const isMain = (() => {
  try {
    if (typeof require !== 'undefined' && require.main === module) return true;
  } catch {
    // require is not defined in ESM
  }
  try {
    // @ts-expect-error import.meta is only available in ESM
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();
if (isMain) {
  const cmd = process.argv[2];
  if (cmd === 'reset') {
    runOrExit();
    ensureTestDatabase()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  } else if (cmd === 'check') {
    try {
      assertTestDbSafe();
      console.log('✅ All three guards pass.');
      process.exit(0);
    } catch (err) {
      if (err instanceof TestGuardError) {
        printFailure(err);
      }
      process.exit(2);
    }
  } else {
    console.error('Usage: tsx tests/setup/test-db.ts [reset|check]');
    process.exit(1);
  }
}
