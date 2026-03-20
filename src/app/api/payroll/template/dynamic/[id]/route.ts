// src/app/api/payroll/templates/dynamic/[id]/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

type RouteParams = {
  params: {
    id: string
  }
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN', 'STAFF'])

    const { id } = params
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const template = await prisma.payrollTemplate.findUnique({
      where: { id },
      include: {
        fields: {
          orderBy: { order: 'asc' }
        }
      }
    })

    if (!template) {
      return withCors(ApiResponse.error('Template not found', 404), origin)
    }

    // Check access
    if (!template.isSystem && user.role !== 'SUPER_ADMIN') {
      if (!companyId) {
        return withCors(ApiResponse.error('Company ID is required', 400), origin)
      }

      if (template.companyId !== companyId) {
        return withCors(ApiResponse.error('Template does not belong to this company', 403), origin)
      }

      const hasAccess = await verifyCompanyAccess(user, companyId)
      if (!hasAccess) {
        return withCors(ApiResponse.error('Access denied', 403), origin)
      }
    }

    return withCors(
      ApiResponse.success(template, 'Template retrieved successfully'),
      origin
    )

  } catch (error) {
    console.error('Error fetching template:', error)
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

async function verifyCompanyAccess(user: any, companyId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true
  
  try {
    const userCompany = await prisma.userCompany.findFirst({
      where: {
        userId: user.userId,
        companyId: companyId,
        OR: [
          { role: user.role },
          { role: 'ALL' }
        ]
      }
    })
    return !!userCompany
  } catch {
    return user.companyId === companyId
  }
}