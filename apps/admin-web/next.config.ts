import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mobilis/api', '@mobilis/domain', '@mobilis/ui', '@mobilis/config'],
  webpack(config, { isServer }) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      'server-only': path.resolve(process.cwd(), 'node_modules/server-only/empty.js'),
    };

    if (!isServer) {
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        react: path.resolve(process.cwd(), 'node_modules/react'),
        'react-dom': path.resolve(process.cwd(), 'node_modules/react-dom'),
        'react/jsx-runtime': path.resolve(
          process.cwd(),
          'node_modules/react/jsx-runtime.js',
        ),
      };
    }

    return config;
  },
};

export default nextConfig;
