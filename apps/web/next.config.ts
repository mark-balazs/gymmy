import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Produces a self-contained server bundle, which keeps the Docker image small
  // (no node_modules copy) and is ignored harmlessly by Vercel.
  output: 'standalone',
  // The monorepo root, so standalone tracing picks up the workspace package.
  // fileURLToPath, not URL.pathname — the latter yields "/D:/..." on Windows,
  // which is not a path any OS will accept.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  transpilePackages: ['@athletic/domain'],
  reactStrictMode: true,
  poweredByHeader: false,
  // Next 16 no longer takes an `eslint` key here; linting runs in CI instead.
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
