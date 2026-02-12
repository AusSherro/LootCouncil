import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude native modules from bundling
  serverExternalPackages: ['better-sqlite3'],

  // Empty turbopack config to silence the warning
  turbopack: {},

  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent webpack from bundling native modules
      config.externals = config.externals || [];
      config.externals.push({
        'better-sqlite3': 'commonjs better-sqlite3',
      });
    }
    return config;
  },
};

export default nextConfig;
