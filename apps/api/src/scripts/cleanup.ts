/**
 * Periodic database cleanup (TD-009).
 *
 * Idempotent, bounded, and logged cleanup for temporary/expiring tables.
 * Designed to run as a Render Cron Job (not in-process, so cleanup is
 * not duplicated across API instances).
 *
 * Retention policies:
 *   rate_limit_events        — DELETE rows older than 7 days
 *   verification_tokens      — DELETE expired + used rows older than 30 days
 *   password_reset_tokens    — DELETE expired + used rows older than 30 days
 *   refresh_tokens           — DELETE expired/revoked rows older than 90 days
 *   sessions                 — DELETE expired/revoked rows older than 90 days
 *   login_lockouts           — DELETE rows with locked_until older than 24h
 *   activity_events          — DELETE retention='feed' older than 30 days
 *
 * Never deletes: activity_events with retention='audit' or 'both'
 *
 * Usage:
 *   npx tsx src/scripts/cleanup.ts
 *   DRY_RUN=1 npx tsx src/scripts/cleanup.ts   # report only, no deletes
 */

import { query } from './../db/index';

interface CleanupResult {
  table: string;
  deleted: number;
  durationMs: number;
  error?: string;
}

const DRY_RUN = process.env.DRY_RUN === '1';

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function deleteBounded(
  table: string,
  where: string,
  params: unknown[],
  label: string,
): Promise<number> {
  if (DRY_RUN) {
    // Count rows that WOULD be deleted
    const result = await query(
      `SELECT COUNT(*) AS cnt FROM ${table} WHERE ${where}`,
      params,
    );
    const count = parseInt(result.rows[0].cnt, 10);
    log(`  [DRY RUN] ${label}: would delete ${count} rows`);
    return 0;
  }

  // Delete in batches of 1000 to avoid long-held locks
  let total = 0;
  let deleted = 0;
  do {
    const result = await query(
      `DELETE FROM ${table}
        WHERE id IN (
          SELECT id FROM ${table}
          WHERE ${where}
          LIMIT 1000
        )`,
      params,
    );
    deleted = result.rowCount ?? 0;
    total += deleted;
  } while (deleted > 0);

  log(`  ${label}: deleted ${total} rows`);
  return total;
}

async function cleanupRateLimitEvents(): Promise<CleanupResult> {
  const label = 'rate_limit_events (age > 7 days)';
  const start = Date.now();
  try {
    const deleted = await deleteBounded(
      'rate_limit_events',
      'created_at < NOW() - INTERVAL \'7 days\'',
      [],
      label,
    );
    return { table: 'rate_limit_events', deleted, durationMs: Date.now() - start };
  } catch (err) {
    return { table: 'rate_limit_events', deleted: -1, durationMs: Date.now() - start, error: String(err) };
  }
}

async function cleanupVerificationTokens(): Promise<CleanupResult> {
  const label = 'verification_tokens (expired OR used, age > 30 days)';
  const start = Date.now();
  try {
    const deleted = await deleteBounded(
      'verification_tokens',
      '(expires_at < NOW() OR used_at IS NOT NULL) AND created_at < NOW() - INTERVAL \'30 days\'',
      [],
      label,
    );
    return { table: 'verification_tokens', deleted, durationMs: Date.now() - start };
  } catch (err) {
    return { table: 'verification_tokens', deleted: -1, durationMs: Date.now() - start, error: String(err) };
  }
}

async function cleanupPasswordResetTokens(): Promise<CleanupResult> {
  const label = 'password_reset_tokens (expired OR used, age > 30 days)';
  const start = Date.now();
  try {
    const deleted = await deleteBounded(
      'password_reset_tokens',
      '(expires_at < NOW() OR used_at IS NOT NULL) AND created_at < NOW() - INTERVAL \'30 days\'',
      [],
      label,
    );
    return { table: 'password_reset_tokens', deleted, durationMs: Date.now() - start };
  } catch (err) {
    return { table: 'password_reset_tokens', deleted: -1, durationMs: Date.now() - start, error: String(err) };
  }
}

async function cleanupRefreshTokens(): Promise<CleanupResult> {
  const label = 'refresh_tokens (expired OR revoked, age > 90 days)';
  const start = Date.now();
  try {
    const deleted = await deleteBounded(
      'refresh_tokens',
      '(expires_at < NOW() OR revoked_at IS NOT NULL) AND created_at < NOW() - INTERVAL \'90 days\'',
      [],
      label,
    );
    return { table: 'refresh_tokens', deleted, durationMs: Date.now() - start };
  } catch (err) {
    return { table: 'refresh_tokens', deleted: -1, durationMs: Date.now() - start, error: String(err) };
  }
}

async function cleanupSessions(): Promise<CleanupResult> {
  const label = 'sessions (expired OR revoked, age > 90 days)';
  const start = Date.now();
  try {
    const deleted = await deleteBounded(
      'sessions',
      '(expires_at < NOW() OR revoked_at IS NOT NULL) AND created_at < NOW() - INTERVAL \'90 days\'',
      [],
      label,
    );
    return { table: 'sessions', deleted, durationMs: Date.now() - start };
  } catch (err) {
    return { table: 'sessions', deleted: -1, durationMs: Date.now() - start, error: String(err) };
  }
}

async function cleanupLoginLockouts(): Promise<CleanupResult> {
  const label = 'login_lockouts (locked_until older than 24h)';
  const start = Date.now();
  try {
    const deleted = await deleteBounded(
      'login_lockouts',
      'locked_until IS NOT NULL AND locked_until < NOW() - INTERVAL \'24 hours\'',
      [],
      label,
    );
    return { table: 'login_lockouts', deleted, durationMs: Date.now() - start };
  } catch (err) {
    return { table: 'login_lockouts', deleted: -1, durationMs: Date.now() - start, error: String(err) };
  }
}

async function cleanupActivityEvents(): Promise<CleanupResult> {
  const label = 'activity_events (retention=feed, age > 30 days)';
  const start = Date.now();
  try {
    const deleted = await deleteBounded(
      'activity_events',
      "retention = 'feed' AND created_at < NOW() - INTERVAL '30 days'",
      [],
      label,
    );
    return { table: 'activity_events', deleted, durationMs: Date.now() - start };
  } catch (err) {
    return { table: 'activity_events', deleted: -1, durationMs: Date.now() - start, error: String(err) };
  }
}

async function main(): Promise<void> {
  log(`Cleanup starting${DRY_RUN ? ' (DRY RUN — no rows will be deleted)' : ''}`);
  log('');

  const results: CleanupResult[] = await Promise.all([
    cleanupRateLimitEvents(),
    cleanupVerificationTokens(),
    cleanupPasswordResetTokens(),
    cleanupRefreshTokens(),
    cleanupSessions(),
    cleanupLoginLockouts(),
    cleanupActivityEvents(),
  ]);

  log('');
  log('── Summary ───────────────────────────────────────────────');
  let total = 0;
  for (const r of results) {
    if (r.error) {
      log(`  ❌ ${r.table}: ERROR — ${r.error}`);
    } else {
      total += r.deleted;
      const ok = DRY_RUN ? '~' : '✔';
      log(`  ${ok} ${r.table}: ${r.deleted} rows in ${r.durationMs}ms`);
    }
  }
  log(`─────────────────────────────────────────────────────────`);
  log(`  Total rows cleaned: ${total}`);
  log(`  Mode: ${DRY_RUN ? 'DRY RUN (no rows deleted)' : 'LIVE'}`);
  log('─────────────────────────────────────────────────────────');
}

main().catch((err) => {
  console.error('Cleanup script failed:', err);
  process.exit(1);
});
