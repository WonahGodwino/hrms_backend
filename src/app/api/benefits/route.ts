// src/app/api/benefits/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN', 'STAFF'])

    // Benefits are global, but we still verify company access
    let companyId = user.companyId
    
    if (!companyId && user.role === 'SUPER_ADMIN') {
      const url = new URL(request.url)
      companyId = url.searchParams.get('companyId') || ''
      if (!companyId) {
        return withCors(ApiResponse.error('Company ID required for SUPER_ADMIN', 400), origin)
      }
    }
    
    if (!companyId) {
      return withCors(ApiResponse.error('No company access found', 403), origin)
    }

    // Fetch all benefits (global list)
    const benefits = await prisma.benefit.findMany({
      where: {
        OR: [
          { companyId: null }, // Global benefits
          { companyId: companyId } // Company-specific benefits
        ]
      },
      orderBy: { label: 'asc' }
    })
    
    return withCors(ApiResponse.success(benefits), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}