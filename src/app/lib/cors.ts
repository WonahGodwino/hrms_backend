// src/app/lib/cors.ts (UPDATED VERSION)
import { NextRequest, NextResponse } from 'next/server'

// ALLOW requests from these origins
const allowedOrigins = [
  'https://app.isurfglobal.com',  // Your frontend app
  'http://localhost:5173',        // Local development
  'http://localhost:3000',        // Local development
  process.env.ALLOWED_ORIGINS?.split(',') || [],
].flat().filter(Boolean)

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false
  
  // Exact match
  if (allowedOrigins.includes(origin)) return true
  
  // Allow all subdomains of isurfglobal.com
  if (origin.endsWith('.isurfglobal.com')) return true
  
  // Allow localhost with any port
  if (origin.includes('localhost:')) {
    const localhostRegex = /^http:\/\/localhost:\d+$/
    return localhostRegex.test(origin)
  }
  
  return false
}

export function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin', // Important for caching
  }

  // Only set the origin header if the origin is allowed
  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }

  return headers
}

export function withCors(response: NextResponse, origin: string | null) {
  const headers = getCorsHeaders(origin)
  
  // Create a new response with the same body/status
  const corsResponse = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  })
  
  // Add CORS headers
  Object.entries(headers).forEach(([key, value]) => {
    corsResponse.headers.set(key, value)
  })
  
  return corsResponse
}

export function handleCorsOptions(req: NextRequest) {
  const origin = req.headers.get('origin')
  
  // Check if origin is allowed
  if (!origin || !isOriginAllowed(origin)) {
    return new NextResponse(null, {
      status: 403,
      statusText: 'Origin not allowed',
    })
  }
  
  // Create preflight response
  const response = new NextResponse(null, { 
    status: 204,
    statusText: 'No Content'
  })
  
  // Add CORS headers
  const headers = getCorsHeaders(origin)
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  
  return response
}