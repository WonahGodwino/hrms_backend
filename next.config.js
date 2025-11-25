/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove experimental and api sections as they're deprecated in Next.js 14
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  // Enable if you need larger file uploads
  serverExternalPackages: ['pdfkit'],
}

module.exports = nextConfig