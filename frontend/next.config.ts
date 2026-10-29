import path from 'node:path';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import type { NextConfig } from 'next';

const nextConfig = (phase: string): NextConfig => ({
  distDir:
    phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next-production',
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  async rewrites() {
    const backendUrl =
      process.env.INTERNAL_API_URL ||
      (process.env.NODE_ENV === 'production' ? 'http://backend:4000' : 'http://localhost:4000');
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: `${backendUrl}/api/:path*`,
        },
      ],
    };
  },
});

export default nextConfig;
