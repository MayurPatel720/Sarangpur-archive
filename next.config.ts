import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Mongoose ships optional native/dynamic requires that the bundler should not try to trace.
  serverExternalPackages: ['mongoose'],

  // `standalone` produces a self-contained server for Docker and on-prem deployment.
  // Vercel builds its own output and warns about this setting, so it is switched off
  // there. VERCEL=1 is set automatically during a Vercel build.
  output: process.env.VERCEL ? undefined : 'standalone',
};

export default nextConfig;
