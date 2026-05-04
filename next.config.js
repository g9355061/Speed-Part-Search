/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['xlsx', 'xlsx-js-style'],
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'bcryptjs', 'geoip-lite'],
  },
};

module.exports = nextConfig;
