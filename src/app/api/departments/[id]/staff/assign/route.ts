// POST /api/departments/[id]/staff/assign — assign staff to department
// GET  /api/departments/[id]/staff/available — list staff not in department
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getDepartmentWithAccess } from '@/app/lib/departments/department-utils'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

// GET available staff — all active staff NOT in this department
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN', 'MANAGER'])
    const department = await getDepartmentWithAccess(user, params.id)

    const staff = await prisma.staffRecord.findMany({
      where: {
        companyId: department.companyId,
        isActive: true,
        departmentId: { not: params.id },
      },
      select: { id: true, firstName: true, lastName: true, email: true, position: true },
      orderBy: { firstName: 'asc' },
      take: 100,
    })

    const data = staff.map(s => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`.trim(),
      email: s.email,
      position: s.position || '—',
    }))

    return withCors(ApiResponse.success(data), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}

// POST assign staff to this department
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])
    const department = await getDepartmentWithAccess(user, params.id)

    const body = await request.json().catch(() => ({}))
    const staffId = body.staffId
    if (!staffId) return withCors(ApiResponse.error('staffId is required', 400), origin)

    const staff = await prisma.staffRecord.findFirst({
      where: { id: staffId, companyId: department.companyId, isActive: true },
    })
    if (!staff) return withCors(ApiResponse.error('Staff not found', 404), origin)

    await prisma.staffRecord.update({
      where: { id: staffId },
      data: { departmentId: params.id },
    })

    // Update active headcount
    const headcount = await prisma.staffRecord.count({
      where: { departmentId: params.id, isActive: true },
    })
    await prisma.department.update({
      where: { id: params.id },
      data: { activeHeadcount: headcount },
    })

    return withCors(ApiResponse.success({
      staffId,
      departmentId: params.id,
      activeHeadcount: headcount,
    }, 'Staff assigned to department.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
