/**
 * JWT helper for RC tests.
 *
 * Generates access + refresh tokens that match the API's expectations:
 *   - HS256, signed with NEXTAUTH_SECRET (matches smoke-test.sh)
 *   - Claims: sub, id, role, email, name
 *   - iat + exp (default 1h)
 *
 * Refuses to run if NEXTAUTH_SECRET is unset — that's a hard test smell.
 * Refuses to run if NODE_ENV === 'production' — defense in depth.
 */

import { SignJWT } from 'jose';

export type TestRole =
  | 'admin'
  | 'office_manager'
  | 'dispatcher'
  | 'field_technician';

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: TestRole;
}

function requireSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      'NEXTAUTH_SECRET is not set. Cannot generate test tokens. ' +
        'Check that .env is loaded or that NEXTAUTH_SECRET is exported.',
    );
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to generate test JWTs in production.');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Generate an access JWT for a test user. The API's auth middleware
 * checks for `request.user.id`, `request.user.role`, `request.user.email`,
 * and `request.user.name` — all of which we include.
 */
export async function makeAccessToken(
  user: TestUser,
  ttlSeconds: number = 3600,
): Promise<string> {
  const secret = requireSecret();
  return new SignJWT({
    sub: user.id,
    id: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('fieldconnect-api')
    .setAudience('fieldconnect-web')
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret);
}

/**
 * Generate a refresh token. Refresh tokens in the API are opaque random
 * strings (not JWTs) — see db/queries/refresh-tokens.ts. For tests we
 * use a 64-char hex string.
 */
export function makeRefreshToken(): string {
  const bytes = new Uint8Array(32);
  // Use globalThis.crypto which is available in Node 20+
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate both tokens and return them as a bundle. Convenience for tests.
 */
export async function makeAuthBundle(user: TestUser): Promise<{
  accessToken: string;
  refreshToken: string;
  user: TestUser;
}> {
  return {
    accessToken: await makeAccessToken(user),
    refreshToken: makeRefreshToken(),
    user,
  };
}
