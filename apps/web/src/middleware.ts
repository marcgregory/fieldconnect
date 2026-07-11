import { NextRequest, NextResponse } from 'next/server';

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

/**
 * Middleware that sets a per-request nonce and Content-Security-Policy header.
 *
 * Next.js reads the `x-nonce` response header and automatically attaches the
 * nonce attribute to every inline <script> it injects (__NEXT_DATA__,
 * bootstrap chunks, route data). This lets us use `script-src 'nonce-<value>'`
 * instead of `'unsafe-inline'` for scripts.
 *
 * Styles still need `'unsafe-inline'` because Next.js 14 App Router emits
 * inline <style> tags for critical CSS — tracked as TD-010.
 */
export function middleware(request: NextRequest) {
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
