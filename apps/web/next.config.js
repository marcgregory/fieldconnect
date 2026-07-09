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
};

module.exports = nextConfig;
