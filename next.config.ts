import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Packages that use Node.js APIs and must not be bundled for the Edge Runtime.
  // Route handlers that use these declare `export const runtime = "nodejs"`.
  serverExternalPackages: ['@prisma/adapter-pg', 'pg', 'firebase-admin', 'sharp'],
}

export default nextConfig
