/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },

  // Allow heavy server-only packages like pdfkit / Prisma adapter / pg
  experimental: {
    serverComponentsExternalPackages: ['pdfkit', '@prisma/adapter-pg', 'pg'],
  },
}

module.exports = nextConfig
