// GET /api/business-units/stats
// KPI metrics for the Business Units dashboard, scoped to the selected company:
//   totalUnits        — active BUs
//   mappedDepartments — departments linked to a BU
//   attentionNeeded   — active BUs with no head OR no departments mapped
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveBUCompanyId } from '@/app/lib/business-units/bu-utils'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'])

    const scope = await resolveBUCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)
    const companyId = scope.companyId as string

    const [totalUnits, mappedDepartments, headless, activeUnits] = await Promise.all([
      (prisma as any).businessUnit.count({ where: { companyId, archived: 0, status: 'Active' } }),
      (prisma as any).department.count({ where: { companyId, businessUnitId: { not: null } } }),
      (prisma as any).businessUnit.count({ where: { companyId, archived: 0, status: 'Active', headId: null } }),
      (prisma as any).businessUnit.findMany({
        where: { companyId, archived: 0, status: 'Active' },
        select: { id: true, headId: true, _count: { select: { departments: true } } },
      }),
    ])

    // Attention = active BUs missing a head OR with zero mapped departments.
    const attentionNeeded = activeUnits.filter(
      (u: any) => !u.headId || (u._count?.departments || 0) === 0,
    ).length

    return withCors(ApiResponse.success({
      totalUnits,
      mappedDepartments,
      headless,
      attentionNeeded,
    }, 'Business unit stats fetched'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
