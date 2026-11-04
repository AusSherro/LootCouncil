import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',

  // Empty turbopack config to silence the warning
  turbopack: {},

  experimental: {
    optimizePackageImports: ['recharts'],
  },
};

export default nextConfig;
