// src/app/lib/cors.ts
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
  
  // Debug logging
  console.log('[CORS] Checking origin:', origin)
  console.log('[CORS] Allowed origins:', allowedOrigins)
  
  // Exact match
  if (allowedOrigins.includes(origin)) {
    console.log('[CORS] ✅ Origin allowed (exact match):', origin)
    return true
  }
  
  // Allow all subdomains of isurfglobal.com
  if (origin.endsWith('.isurfglobal.com')) {
    console.log('[CORS] ✅ Origin allowed (subdomain):', origin)
    return true
  }
  
  // Allow localhost with any port
  if (origin.includes('localhost:')) {
    const allowed = /^http:\/\/localhost:\d+$/.test(origin)
    console.log('[CORS] Localhost check:', origin, 'allowed:', allowed)
    return allowed
  }
  
  console.log('[CORS] ❌ Origin not allowed:', origin)
  return false
}

export function getCorsHeaders(origin: string | null): Record<string, string> {
  console.log('[CORS] getCorsHeaders called with origin:', origin)
  
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }

  // Set origin header if allowed
  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    console.log('[CORS] ✅ Setting Access-Control-Allow-Origin:', origin)
  } else {
    console.log('[CORS] ❌ Not setting Access-Control-Allow-Origin (origin not allowed or null)')
  }

  console.log('[CORS] Final headers:', headers)
  return headers
}

export function withCors(response: NextResponse, origin: string | null) {
  console.log('[CORS] withCors called for response:', response.status)
  
  // Create a new response with the same body/status
  const corsResponse = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(),
  })
  
  // Copy all original headers
  response.headers.forEach((value, key) => {
    corsResponse.headers.set(key, value)
  })
  
  // Add CORS headers
  const corsHeaders = getCorsHeaders(origin)
  Object.entries(corsHeaders).forEach(([key, value]) => {
    corsResponse.headers.set(key, value)
    console.log(`[CORS] Setting header: ${key} = ${value}`)
  })
  
  console.log('[CORS] Final response headers:', Object.fromEntries(corsResponse.headers.entries()))
  return corsResponse
}

export function handleCorsOptions(req: NextRequest) {
  const origin = req.headers.get('origin')
  console.log('[CORS] OPTIONS request from origin:', origin)
  
  // Always return a successful OPTIONS response
  const response = new NextResponse(null, { 
    status: 204,
    statusText: 'No Content'
  })
  
  // Add CORS headers
  const headers = getCorsHeaders(origin)
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value)
    console.log(`[CORS OPTIONS] Setting header: ${key} = ${value}`)
  })
  
  console.log('[CORS] OPTIONS response ready with headers:', Object.fromEntries(response.headers.entries()))
  return response
}