/** @type {import('next').NextConfig} */

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
  // Security headers are primarily set by middleware.ts (CSP with nonce).
  // This config adds defense-in-depth headers that Next.js applies at the
  // server level for all responses, including those not processed by middleware.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
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
