import path from 'node:path';
import type { NextConfig } from 'next';

const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // Trace workspace packages from the monorepo root for standalone builds.
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  poweredByHeader: false,
  reactStrictMode: true,
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: SECURITY_HEADERS }]);
  },
};

export default nextConfig;
