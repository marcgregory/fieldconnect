import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Note: middleware runs on the Edge Runtime where Node.js 'crypto' is not
// available. Use the Web Crypto API (crypto.getRandomValues) instead.

// Derive the API host for CSP connect-src. Some pages (auth forms, image URLs)
// call the Fastify API directly rather than through the BFF proxy, so both
// the HTTPS endpoint and the WebSocket endpoint must be allowed.
let API_CONNECT_HOST = "'self'";
try {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const parsed = new URL(apiUrl);
  // Allow HTTPS for direct API calls and WS/WSS for Socket.IO
  const wsProto = parsed.protocol === 'https:' ? 'wss' : 'ws';
  API_CONNECT_HOST = `'self' ${wsProto}://${parsed.host} ${apiUrl}`;
} catch {
  // fallback: self-only
}

// ─── Auth route patterns ───────────────────────────────────────────────────────
// Pages that authenticated users should never see.
const AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

// ─── Protected route patterns ──────────────────────────────────────────────────
// Pages that require authentication. Unmatched public pages are allowed.
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/mobile',
  '/jobs',
  '/review',
  '/reports',
  '/audit',
  '/sessions',
];

/**
 * Check whether the user is authenticated by reading the NextAuth JWT cookie.
 * Uses `getToken` from next-auth/jwt which is Edge Runtime compatible.
 *
 * Returns the token payload if valid, null otherwise.
 */
async function getSessionToken(
  request: NextRequest,
): Promise<{ id: string; role: string } | null> {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token || !token.id) return null;
    return { id: token.id as string, role: token.role as string };
  } catch {
    // Token parsing failure — treat as unauthenticated
    return null;
  }
}

/**
 * Middleware that:
 *  1. Generates a per-request nonce + Content-Security-Policy header.
 *  2. Redirects authenticated users away from auth-only pages (/login, /register).
 *  3. Redirects unauthenticated users away from protected pages to /login.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Auth guard (skip for static assets and API routes) ──────────────
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));
  const isProtectedRoute = PROTECTED_PREFIXES.some((r) => pathname.startsWith(r));

  if (isAuthRoute || isProtectedRoute) {
    const token = await getSessionToken(request);

    // Authenticated user trying to visit login/register → redirect to dashboard
    if (isAuthRoute && token) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Unauthenticated user trying to visit a protected page → redirect to login
    if (isProtectedRoute && !token) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── CSP + nonce (applied to all page routes) ───────────────────────

  // Generate a fresh nonce per request using the Web Crypto API
  // (Edge Runtime compatible). 16 random bytes → base64url string.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const nonceCsp = `'nonce-${nonce}'`;

  const response = NextResponse.next();

  // Tell Next.js to add nonce="..." to its inline scripts
  response.headers.set('x-nonce', nonce);

  // ── Content Security Policy ─────────────────────────────────────────
  response.headers.set(
    'Content-Security-Policy',
    [
      `default-src 'self'`,
      `script-src 'self' ${nonceCsp}`,
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data: blob: https://res.cloudinary.com`,
      `connect-src ${API_CONNECT_HOST}`,
      `font-src 'self'`,
      `form-action 'self'`,
      `frame-ancestors 'none'`,
      `base-uri 'self'`,
      `object-src 'none'`,
      'upgrade-insecure-requests',
    ].join('; '),
  );

  return response;
}

/**
 * Only run middleware on page routes. Exclude:
 * - API routes (CSP doesn't apply to JSON endpoints)
 * - Next.js internal paths (_next/static, _next/image, _next/data)
 * - Static assets (favicon, manifest, SW, icons, images)
 */
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|_next/data|favicon|manifest|\\.well-known|sw\\.js|apple-touch-icon|icons/|.*\\.png|.*\\.ico|.*\\.svg|.*\\.json).*)',
  ],
};
