import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/certifications/filter-options
// Returns options for departments, roles, statuses, dateRanges, certTypes, issuingAuthorities
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const [deptRows, roleRows, certTypesRows, authorityRows] = await Promise.all([
      // Department list
      forCompany(companyId).department.findMany({
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      // Staff roles list
      forCompany(companyId).staffRecord.findMany({
        select: { role: true },
        distinct: ['role'],
      }),
      // Certification types list
      forCompany(companyId).certificationType.findMany({
        where: { isActive: true },
        select: { id: true, name: true, type: true, authority: true },
        orderBy: { name: 'asc' },
      }),
      // Distinct authorities from certification types
      forCompany(companyId).certificationType.findMany({
        select: { authority: true },
        distinct: ['authority'],
      }),
    ])

    const departments = Array.from(new Set(deptRows.map(d => d.name).filter(Boolean)))
    const roles = Array.from(new Set(roleRows.map(r => r.role).filter(Boolean)))
    const issuingAuthorities = Array.from(new Set(authorityRows.map(a => a.authority).filter(Boolean)))

    const statuses = ['Valid', 'Expiring Soon', 'Expired', 'Pending', 'Archived']

    const dateRanges = [
      { label: 'All Time', value: '' },
      { label: 'Last 30 Days', value: 'last30' },
      { label: 'This Month', value: 'thisMonth' },
      { label: 'This Year', value: 'thisYear' },
      { label: 'Expiring within 7 Days', value: 'expiring7' },
      { label: 'Expiring within 30 Days', value: 'expiring30' },
      { label: 'Expiring within 60 Days', value: 'expiring60' },
    ]

    return withCors(
      ApiResponse.success({
        departments,
        roles,
        statuses,
        dateRanges,
        certTypes: certTypesRows,
        issuingAuthorities,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
