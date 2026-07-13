import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest configuration.
 *
 * Two strategies depending on command:
 *   - `pnpm test:unit:safety` → run only safety-guards tests (guard off)
 *   - `pnpm test`             → run all other tests (guard on)
 *
 * The split is done by:
 *   1. Setting env.RUNNING_SAFETY_TESTS=1 in the test:unit:safety npm script
 *   2. Having tests/setup/vitest-setup.ts honor that flag to skip the guard
 *
 * Setup files:
 *   - tests/setup/vitest-setup.ts   → enforces guard UNLESS RUNNING_SAFETY_TESTS=1
 *
 * On Windows, env vars must be set via cross-env or by editing a wrapper
 * script. We use cross-env for portability.
 */

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    setupFiles: ['tests/setup/vitest-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['apps/api/src/**/*.ts'],
      exclude: [
        'apps/api/src/**/*.test.ts',
        'apps/api/src/scripts/**',
        'apps/api/src/migrate.ts',
        'apps/api/src/db/migrations/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@fieldconnect/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@fieldconnect/api': path.resolve(__dirname, 'apps/api/src'),
    },
  },
});

