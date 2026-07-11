/** @type {import('next').NextConfig} */

// Derive the WebSocket host for Content-Security-Policy connect-src.
// In dev the API is localhost:3001; in production it's the Render service URL.
let WS_CONNECT_SRC = "'self'";
try {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const parsed = new URL(apiUrl);
  const wsProto = parsed.protocol === 'https:' ? 'wss' : 'ws';
  WS_CONNECT_SRC = `'self' ${wsProto}://${parsed.host}`;
} catch {
  // fallback: self-only
}

const nextConfig = {
  // Allow up to 12MB for API proxy file uploads
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [390, 480, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 31536000,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // ── Content Security Policy ───────────────────────────────
          // script-src: Next.js bundles all JS with content hashes. No
          // inline scripts in our code. No 'unsafe-eval' or 'unsafe-inline'.
          // style-src 'unsafe-inline': Next.js 14 App Router emits inline
          //   <style> tags for critical CSS. Tracked as TD-009.
          // img-src: Cloudinary for image delivery, data: for canvas
          //   signatures, blob: for user photo upload previews.
          // connect-src: Socket.IO WebSocket to the API server.
          // frame-ancestors 'none': clickjacking protection (replaces
          //   X-Frame-Options).
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://res.cloudinary.com",
              `connect-src ${WS_CONNECT_SRC}`,
              "font-src 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "object-src 'none'",
              'upgrade-insecure-requests',
            ].join('; '),
          },
          // ── Other security headers ────────────────────────────────
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(self), geolocation=(self), fullscreen=(self), screen-wake-lock=(self), notifications=(self)',
          },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
