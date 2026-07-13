/**
 * Vitest global setup.
 *
 * The triple-guard is normally enforced in `test-db.ts#assertTestDbSafe`.
 * Tests that exercise the guard itself (the negative safety tests) need
 * to be able to call `assertTestDbSafe` with bad env and observe the
 * throw — they cannot have the guard run before they get a chance to
 * set the bad env.
 *
 * Resolution: the safety tests set `RUNNING_SAFETY_TESTS=1` (via the npm
 * script cross-env, AND as a defense-in-depth at the top of the test
 * file). This setup file only enforces the guard when the flag is NOT
 * set, so normal test runs are protected but safety tests can exercise
 * every failure mode.
 *
 * For everything else, we ALSO verify that NODE_ENV !== 'production'
 * as a backstop in case SKIP_TEST_DB_GUARD is set.
 */

if (!process.env.RUNNING_SAFETY_TESTS) {
  if (process.env.NODE_ENV === 'production') {
    console.error('\n❌ Refusing to run tests with NODE_ENV=production\n');
    process.exit(2);
  }
  if (process.env.SKIP_TEST_DB_GUARD !== '1') {
    try {
      // Lazy import to avoid loading the module during safety-test setup
      // and to support Vitest's transform pipeline (.ts modules).
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { assertTestDbSafe } = require('./test-db.ts');
      assertTestDbSafe();
    } catch (err) {
      // Re-throw TestGuardError but with a clearer prefix
      if (err instanceof Error && err.name === 'TestGuardError') {
        console.error('\n❌ Test database guard failed at vitest setup:');
        console.error(err.message);
        console.error('\nRun `pnpm rc:reset` to set the environment.\n');
      }
      throw err;
    }
  }
}
