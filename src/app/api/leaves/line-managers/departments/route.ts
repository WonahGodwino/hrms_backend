// GET /api/leaves/line-managers/departments?companyId=
// Departments of a company with headcount and how many line managers each has,
// for the Leave "Manager Assignment" page.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
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
    const user = await requireRoleAsync(authHeader.replace('Bearer ', ''), ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) {
      return withCors(ApiResponse.error('companyId is required', 400), origin)
    }
    if (user.role !== 'SUPER_ADMIN' && !(user.companyIds || []).includes(companyId) && user.companyId !== companyId) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const [departments, staffCounts, ladders] = await Promise.all([
      prisma.department.findMany({
        where: { companyId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true },
      }),
      prisma.staffRecord.groupBy({
        by: ['departmentId'],
        where: { companyId, isActive: true, departmentId: { not: null } },
        _count: { _all: true },
      }),
      prisma.departmentLineManager.findMany({
        where: { companyId },
        orderBy: { level: 'asc' },
        select: {
          departmentId: true,
          level: true,
          staff: { select: { firstName: true, lastName: true } },
        },
      }),
    ])

    const headcount = new Map(staffCounts.map((c) => [c.departmentId, c._count._all]))
    const byDept = new Map<string, Array<{ level: number; name: string }>>()
    for (const l of ladders) {
      const list = byDept.get(l.departmentId) || []
      list.push({ level: l.level, name: `${l.staff.firstName} ${l.staff.lastName}`.trim() })
      byDept.set(l.departmentId, list)
    }

    return withCors(
      ApiResponse.success({
        departments: departments.map((d) => ({
          id: d.id,
          name: d.name,
          code: d.code,
          staffCount: headcount.get(d.id) || 0,
          managers: byDept.get(d.id) || [],
        })),
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
