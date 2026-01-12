// src/app/lib/cors.ts - SIMPLIFIED WORKING VERSION
import { NextRequest, NextResponse } from 'next/server'

export function handleCorsOptions(req: NextRequest) {
  const origin = req.headers.get('origin')
  
  // Create response
  const response = new NextResponse(null, { 
    status: 204,
    statusText: 'No Content'
  })
  
  // Always set CORS headers for OPTIONS
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  response.headers.set('Access-Control-Max-Age', '86400')
  
  // Set origin if provided and allowed
  if (origin && (
    origin === 'https://app.isurfglobal.com' ||
    origin.endsWith('.isurfglobal.com') ||
    origin.includes('localhost:')
  )) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  }
  
  return response
}

export function withCors(response: NextResponse, origin: string | null) {
  // Set origin if provided and allowed
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