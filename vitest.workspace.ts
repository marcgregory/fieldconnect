import { defineWorkspace } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineWorkspace([
  // API/unit tests (node environment)
  {
    test: {
      name: 'unit',
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
  },
  // Web/component tests (jsdom environment)
  {
    // jsdom environment needs to import React for JSX transform
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'react',
    },
    test: {
      name: 'web',
      globals: true,
      environment: 'jsdom',
      include: ['apps/web/**/*.test.tsx', 'apps/web/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      setupFiles: ['apps/web/.test/setup.ts'],
      testTimeout: 15_000,
      hookTimeout: 15_000,
      pool: 'forks',
      reporters: ['default'],
    },
    resolve: {
      alias: {
        '@fieldconnect/shared': path.resolve(__dirname, 'packages/shared/src'),
        '@': path.resolve(__dirname, 'apps/web/src'),
      },
    },
  },
]);
