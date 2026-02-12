// /src/app/api/health/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withCors, handleCorsOptions } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  
  const startTime = Date.now()
  const services = {
    database: { status: 'unknown', details: '' },
    api: { status: 'operational', details: 'API is responding' }
  }
  
  try {
    // Try to import Prisma from the correct path with safe fallback
    let prismaClient = null
    
    try {
      // Use dynamic import with correct path
      const prismaModule = await import('@/app/lib/prisma')
      prismaClient = prismaModule.prisma || prismaModule.default
    } catch (importError) {
      console.warn('Health check: Prisma import failed, trying fallback...')
      
      // Try CommonJS require as fallback
      try {
        const prismaModule = require('@/app/lib/prisma')
        prismaClient = prismaModule.prisma || prismaModule.default
      } catch (requireError) {
        services.database = { 
          status: 'disconnected', 
          details: 'Prisma client not available during build or import failed' 
        }
      }
    }
    
    // Test database connection if client is available
    if (prismaClient) {
      try {
        await prismaClient.$queryRaw`SELECT 1 as connected`
        services.database = { 
          status: 'connected', 
          details: 'Database connection successful' 
        }
      } catch (dbError: any) {
        services.database = { 
          status: 'disconnected', 
          details: dbError?.message || 'Failed to execute query' 
        }
      }
    }
    
    const responseTime = Date.now() - startTime
    const isHealthy = services.database.status === 'connected'
    
    const response = NextResponse.json({
      success: true,
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      buildPhase: process.env.NEXT_PHASE || 'runtime',
      responseTime: `${responseTime}ms`,
      services,
      version: process.env.npm_package_version || '1.0.0'
    }, { 
      status: isHealthy ? 200 : 503 
    })
    
    return withCors(response, origin)
    
  } catch (error: any) {
    console.error('Health check failed:', error)
    
    const responseTime = Date.now() - startTime
    
    const response = NextResponse.json({
      success: false,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      buildPhase: process.env.NEXT_PHASE || 'runtime',
      responseTime: `${responseTime}ms`,
      error: error?.message || 'Unknown error',
      services: {
        database: { status: 'error', details: 'Health check failed' },
        api: { status: 'degraded', details: 'Error processing health check' }
      }
    }, { status: 503 })
    
    return withCors(response, origin)
  }
}