/**
 * Test app harness for RC integration tests.
 *
 * Builds a real Fastify app via the same code path as production
 * (buildApp in apps/api/src/index.ts) and exposes helpers for:
 *   - making authenticated requests via inject()
 *   - generating access tokens
 *   - cleaning up the test app between tests
 *
 * Uses CLOUDINARY_PROVIDER=mock automatically so tests never hit real
 * Cloudinary. The smoke-test.sh path uses the same trick.
 */

import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../apps/api/src/index';
import {
  makeAccessToken,
  makeAuthBundle,
  type TestUser,
  type TestRole,
} from './jwt';

// Force mock storage for the entire test suite.
process.env.CLOUDINARY_PROVIDER = 'mock';

let _app: FastifyInstance | null = null;

/**
 * Get or build the test app. Single instance per test file for speed —
 * we tear it down in afterAll.
 */
export async function getTestApp(): Promise<FastifyInstance> {
  if (_app) return _app;
  _app = await buildApp();
  // Wait for Fastify to be ready
  await _app.ready();
  return _app;
}

/**
 * Tear down the test app. Call this in afterAll.
 */
export async function closeTestApp(): Promise<void> {
  if (_app) {
    await _app.close();
    _app = null;
  }
}

/**
 * Build a test user with predictable defaults. Override any field.
 */
export function makeUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    id: overrides.id ?? `00000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padStart(12, '0').slice(0, 12)}`,
    email: overrides.email ?? `test-${Math.random().toString(36).slice(2, 10)}@fieldconnect.test`,
    name: overrides.name ?? 'Test User',
    role: overrides.role ?? 'field_technician',
  };
}

/**
 * Build an access token for a user. Convenience.
 */
export async function tokenFor(user: TestUser): Promise<string> {
  return makeAccessToken(user);
}

/**
 * Make an authenticated inject() call.
 */
export async function authedInject(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  user: TestUser,
  payload?: unknown,
): Promise<ReturnType<FastifyInstance['inject']>> {
  const token = await makeAccessToken(user);
  return app.inject({
    method,
    url,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    payload: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
}

export { makeAuthBundle };
export type { TestUser, TestRole };
