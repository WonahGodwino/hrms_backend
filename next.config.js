// next.config.js - MINIMAL HEADERS VERSION
/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },

  // SEC-016: this project is an API and serves no optimised images. Turning the
  // optimiser off makes /_next/image return 404, which closes the Image
  // Optimization API advisories (RCE/DoS) and keeps the endpoint closed.
  images: {
    unoptimized: true,
  },

  // Loaded from node_modules at runtime instead of being bundled.
  // (src/instrumentation.ts, which starts the REL-001 job queue, runs on
  // server start by default since Next 15.)
  serverExternalPackages: ['pdfkit', 'exceljs', '@prisma/adapter-pg', 'pg', 'pg-boss'],

  // The repository root has its own package-lock.json; trace files from here.
  outputFileTracingRoot: __dirname,

  // Only add security headers, NOT CORS headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          // SEC-014: browsers only reach this API over HTTPS once they have seen it.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains'
          },
          // SEC-014: responses are JSON, files, or a few simple HTML pages
          // (unsubscribe, email actions, exports) with inline styles and no
          // scripts, so nothing is allowed to run or be framed.
          {
            key: 'Content-Security-Policy',
            value: "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
          }
        ]
      }
    ]
  }
}

module.exports = nextConfig