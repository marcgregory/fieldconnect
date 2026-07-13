/**
 * Setup for the safety-guards test project.
 *
 * The safety tests need to assert the behavior of `assertTestDbSafe`
 * for every kind of bad env. We must NOT pre-abort them. The flag
 * RUNNING_SAFETY_TESTS=1 (set via vitest config env) is what tells the
 * vitest-setup to skip the global guard check.
 *
 * This file exists so the project has a clean setup hook. The tests
 * themselves manipulate process.env directly.
 */

// Intentionally empty — env is controlled by the project config
// (env: { RUNNING_SAFETY_TESTS: '1' }) and the tests themselves.
export {};
