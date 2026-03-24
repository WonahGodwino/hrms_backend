// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin')
  const pathname = request.nextUrl.pathname
  
  // Only handle API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next()
  }
  
  // Handle preflight OPTIONS requests
  if (request.method === 'OPTIONS') {
    console.log('[Middleware] Handling OPTIONS preflight for', pathname)
    
    const response = new NextResponse(null, { 
      status: 204,
      statusText: 'No Content'
    })
    
    // Add CORS headers - allow specific origins
    if (origin && (
      origin === 'https://app.isurfglobal.com' ||
      origin.endsWith('.isurfglobal.com') ||
      origin.includes('localhost:')
    )) {
      response.headers.set('Access-Control-Allow-Origin', origin)
      response.headers.set('Access-Control-Allow-Credentials', 'true')
      console.log('[Middleware] ✅ Allowed origin:', origin)
    }
    
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With')
    response.headers.set('Access-Control-Max-Age', '86400')
    
    return response
  }
  
  // For non-OPTIONS requests
  const response = NextResponse.next()
  
  // Add CORS headers to responses
  if (origin && (
    origin === 'https://app.isurfglobal.com' ||
    origin.endsWith('.isurfglobal.com') ||
    origin.includes('localhost:')
  )) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
  }
  
  return response
}

export const config = {
  matcher: '/api/:path*',
}