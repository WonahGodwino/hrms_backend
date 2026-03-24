// lib/cors.ts
import { NextRequest, NextResponse } from 'next/server'

const allowedOrigins = [
  'https://app.isurfglobal.com',  // Your frontend app
  'https://247hr.co.uk',           // <--new allowed origin
  'https://www.247hr.co.uk',       // Your frontend app
  'http://localhost:5173',       // Local development http://localhost:5173
  'http://localhost:3000',        // Local development
  process.env.ALLOWED_ORIGINS?.split(',') || [],
].flat().filter(Boolean)

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false
  
  // Debug logging
  console.log('[CORS] Checking origin:', origin)
  
  if (allowedOrigins.includes(origin)) {
    console.log('[CORS] ✅ Origin allowed (exact match):', origin)
    return true
  }

  if (origin.endsWith('.247hr.co.uk')) {
    console.log('[CORS] ✅ Origin allowed (subdomain):', origin)
    return true
  }

  if (origin.includes('localhost:')) {
    return /^http:\/\/localhost:\d+$/.test(origin)
  }

  return false
}

export function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }

  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  
  return headers
}

export function withCors(response: NextResponse, origin: string | null) {
  const corsResponse = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(),
  })
  
  response.headers.forEach((value, key) => {
    corsResponse.headers.set(key, value)
  })
  
  const corsHeaders = getCorsHeaders(origin)
  Object.entries(corsHeaders).forEach(([key, value]) => {
    corsResponse.headers.set(key, value)
  })
  
  return corsResponse
}

export function handleCorsOptions(req: NextRequest) {
  const origin = req.headers.get('origin')
  const response = new NextResponse(null, { 
    status: 204,
    statusText: 'No Content'
  })
  const headers = getCorsHeaders(origin)
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}
