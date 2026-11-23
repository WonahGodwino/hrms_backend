// GET /api/business-units/:id/departments
// Two lists for the "assign departments" transfer UI:
//   assigned  — departments currently mapped to this BU
//   available — active departments not mapped to ANY BU (free to assign)
import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveBUAccessById, staffName } from '@/app/lib/business-units/bu-utils'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

const deptSelect = {
  id: true, name: true, code: true, status: true, activeHeadcount: true,
  head: { select: { firstName: true, lastName: true } },
} as const

const shape = (d: any) => ({
  id: d.id,
  name: d.name,
  code: d.code || '',
  status: d.status,
  headcount: d.activeHeadcount || 0,
  head: staffName(d.head) || 'Unassigned',
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'])
    const { id } = await params

    const access = await resolveBUAccessById(user, id)
    if (access.error) return withCors(ApiResponse.error(access.error.message, access.error.status), origin)
    const companyId = access.companyId as string

    const [assigned, available] = await Promise.all([
      forCompany(companyId).department.findMany({
        where: { businessUnitId: id },
        orderBy: { name: 'asc' },
        select: deptSelect,
      }),
      forCompany(companyId).department.findMany({
        where: { status: 'Active', businessUnitId: null },
        orderBy: { name: 'asc' },
        select: deptSelect,
      }),
    ])

    return withCors(ApiResponse.success({
      assigned: assigned.map(shape),
      available: available.map(shape),
    }, 'Departments fetched'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
