/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['xlsx', 'xlsx-js-style'],
};

module.exports = nextConfig;
