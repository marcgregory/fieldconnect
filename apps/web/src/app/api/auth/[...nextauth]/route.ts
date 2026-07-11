import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

/**
 * Wrap the NextAuth handler to enforce Cache-Control: no-store on every
 * NextAuth-internal response (session, csrf, signin, signout, etc.).
 *
 * These routes handle authentication state — /api/auth/session returns user
 * session data, /api/auth/csrf returns CSRF tokens — and must never be
 * cached by the browser or intermediate proxies.
 */
async function wrappedHandler(
  req: Request,
  ctx: { params: Record<string, string | string[]> },
): Promise<Response> {
  const response = await handler(req, ctx);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export { wrappedHandler as GET, wrappedHandler as POST };
