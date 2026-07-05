/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow up to 12MB for API proxy file uploads
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
};

module.exports = nextConfig;
