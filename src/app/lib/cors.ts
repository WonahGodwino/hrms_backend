// lib/cors.ts
import { NextRequest, NextResponse } from 'next/server'

const allowedOrigins = [
  'https://247hr.co.uk',
  'https://www.247hr.co.uk',
  'http://localhost:5173',       // Local development http://localhost:5173
  'http://localhost:3000',        // Local development
  process.env.ALLOWED_ORIGINS?.split(',') || [],
].flat().filter(Boolean)

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false

  if (allowedOrigins.includes(origin)) return true

  if (origin.endsWith('.247hr.co.uk')) return true

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
    // Without this, the browser blocks JS from reading these headers on the
    // response even though the body itself comes through fine — file-download
    // routes rely on Content-Disposition to name the saved file correctly.
    'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length',
    'Vary': 'Origin',
  }

  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  
  return headers
}

export async function withCors(response: NextResponse, origin: string | null) {
  // Re-wrapping via response.body (a ReadableStream) risks the stream not
  // being fully drained/forwarded on every runtime path — reading it fully
  // into memory first guarantees the wrapped response carries the exact
  // same bytes, which matters for binary downloads (.docx/.xlsx) where a
  // partial stream produces a file that looks fine in size but is silently
  // truncated/corrupted.
  const bodyBuffer = await response.arrayBuffer()
  const corsResponse = new NextResponse(bodyBuffer, {
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
