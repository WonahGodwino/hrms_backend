// GET /api/business-units/org-chart
// The full org chart for the selected company: every active Business Unit with
// its head and mapped departments (each with headcount + head). Consumed by the
// React-Flow org view.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveBUCompanyId, staffName } from '@/app/lib/business-units/bu-utils'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'])

    const scope = await resolveBUCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)
    const companyId = scope.companyId as string

    const units = await (prisma as any).businessUnit.findMany({
      where: { companyId, archived: 0 },
      orderBy: { name: 'asc' },
      include: {
        head: { select: { firstName: true, lastName: true } },
        departments: {
          orderBy: { name: 'asc' },
          select: {
            id: true, name: true, code: true, activeHeadcount: true,
            head: { select: { firstName: true, lastName: true } },
          },
        },
      },
    })

    const data = units.map((u: any) => ({
      id: u.id,
      name: u.name,
      code: u.code || '',
      status: u.status,
      head: staffName(u.head) || 'Unassigned',
      departments: (u.departments || []).map((d: any) => ({
        id: d.id,
        name: d.name,
        code: d.code || '',
        headcount: d.activeHeadcount || 0,
        head: staffName(d.head) || 'Unassigned',
      })),
    }))

    return withCors(ApiResponse.success(data, 'Org chart fetched'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
