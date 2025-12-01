// src/app/lib/cors.ts
import { NextRequest, NextResponse } from 'next/server'

const allowedOrigins = [
  'http://localhost:5173',
  process.env.NEXT_PUBLIC_FRONTEND_URL || '',
].filter(Boolean)

function resolveOrigin(origin: string | null): string | undefined {
  if (!origin) return allowedOrigins[0]
  if (allowedOrigins.includes(origin)) return origin
  return undefined
}

export function getCorsHeaders(origin: string | null) {
  const resolvedOrigin = resolveOrigin(origin)

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  }

  if (resolvedOrigin) {
    headers['Access-Control-Allow-Origin'] = resolvedOrigin
  }

  return headers
}

export function withCors(res: NextResponse, origin: string | null) {
  const headers = getCorsHeaders(origin)
  Object.entries(headers).forEach(([key, value]) => {
    res.headers.set(key, value)
  })
  return res
}

export function handleCorsOptions(req: NextRequest) {
  const origin = req.headers.get('origin')
  const res = new NextResponse(null, { status: 200 })
  return withCors(res, origin)
}
