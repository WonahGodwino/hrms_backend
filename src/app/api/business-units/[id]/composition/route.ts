// GET /api/business-units/:id/composition
// The departments mapped to a Business Unit plus a rolled-up staff headcount.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveBUAccessById, staffName } from '@/app/lib/business-units/bu-utils'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'])
    const { id } = await params

    const access = await resolveBUAccessById(user, id)
    if (access.error) return withCors(ApiResponse.error(access.error.message, access.error.status), origin)
    const companyId = access.companyId as string

    const departments = await (prisma as any).department.findMany({
      where: { companyId, businessUnitId: id },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, code: true, status: true, activeHeadcount: true,
        head: { select: { firstName: true, lastName: true } },
      },
    })

    const mapped = departments.map((d: any) => ({
      id: d.id,
      name: d.name,
      code: d.code || '',
      status: d.status,
      headcount: d.activeHeadcount || 0,
      head: staffName(d.head) || 'Unassigned',
    }))

    const totalStaffRollup = mapped.reduce((sum: number, d: any) => sum + (d.headcount || 0), 0)

    return withCors(ApiResponse.success({
      businessUnitId: id,
      departmentCount: mapped.length,
      totalStaffRollup,
      departments: mapped,
    }, 'Composition fetched'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
