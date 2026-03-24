import { NextResponse } from 'next/server'

/**
 * Middleware to handle API routes
 * - CORS is handled by individual route handlers (not here)
 * - This middleware only passes through requests
 */
export function middleware() {
  // Let route handlers manage CORS for proper origin validation
  // Each route.ts file has OPTIONS handler + withCors() wrapper
  return NextResponse.next()
}

// Configure which routes use this middleware
export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
  ],
}
