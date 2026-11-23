import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/certification-templates/options
// Returns dropdown options for categories, departments, roles, authorities, validity units, expiry types
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const [deptRows, roleRows, certTypes] = await Promise.all([
      forCompany(companyId).department.findMany({
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      forCompany(companyId).staffRecord.findMany({
        select: { role: true },
        distinct: ['role'],
      }),
      forCompany(companyId).certificationType.findMany({
        select: { type: true, authority: true },
      }),
    ])

    const departments = Array.from(new Set(deptRows.map(d => d.name).filter(Boolean)))
    const roles = Array.from(new Set(roleRows.map(r => r.role).filter(Boolean)))
    const categories = Array.from(new Set(['Health', 'Safety', 'Compliance', 'Technical', 'Management', ...certTypes.map(c => c.type).filter(Boolean)]))
    const authorities = Array.from(new Set(['Internal Training Dept', 'OSHA', 'AWS', 'Microsoft', ...certTypes.map(c => c.authority).filter(Boolean)]))

    const validityUnits = ['Days', 'Months', 'Years']
    const expiryTypes   = ['rolling', 'fixed', 'never']
    const statuses      = ['Draft', 'Active', 'Archived']

    return withCors(
      ApiResponse.success({
        categories,
        departments,
        roles,
        authorities,
        validityUnits,
        expiryTypes,
        statuses,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
