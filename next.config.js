/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['xlsx', 'xlsx-js-style'],
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'bcryptjs', 'geoip-lite'],
  },
  // /batch 已併入 /batch-manufacturer（廠商欄選填，功能為超集）；舊書籤轉址
  async redirects() {
    return [{ source: '/batch', destination: '/batch-manufacturer', permanent: true }];
  },
};

module.exports = nextConfig;
