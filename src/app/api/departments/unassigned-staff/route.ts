// src/app/api/departments/unassigned-staff/route.ts
//
// Lists active staff with no Department link (departmentId IS NULL), scoped
// to a company — surfaced to HR/Admin in Core Setup > Departments so they
// can see and act on staff the Staff Management -> Department sync couldn't
// place (blank department text) or that simply haven't been assigned yet.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateCompanyAccess } from '@/app/lib/departments/department-utils'

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
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN', 'MANAGER'])

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return withCors(ApiResponse.error('companyId is required', 400), origin)
    }

    const hasAccess = await validateCompanyAccess(user, companyId)
    if (!hasAccess && user.role !== 'SUPER_ADMIN') {
      return withCors(ApiResponse.error('Forbidden: No access to this company', 403), origin)
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))

    const where = { companyId, isActive: true, departmentId: null as null }

    const [staff, total] = await Promise.all([
      prisma.staffRecord.findMany({
        where,
        select: { id: true, staffId: true, firstName: true, lastName: true, email: true, position: true, department: true },
        orderBy: { firstName: 'asc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.staffRecord.count({ where })
    ])

    return withCors(
      ApiResponse.success({
        staff: staff.map((s) => ({
          id: s.id,
          staffId: s.staffId,
          name: `${s.firstName} ${s.lastName}`.trim(),
          email: s.email,
          position: s.position || '—',
          departmentText: s.department || ''
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
