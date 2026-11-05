// src/app/api/admin/dashboard/reporting/staff-insights/route.ts
//
// GET — headcount, hiring/exit movement, tenure, attendance, leave
// utilization, per-department detail, staff lifecycle, and offboarding
// funnel for the Staff Insights report. Mirrors salary-summary's
// role-scoping (getAccessibleCompanies/resolveTargetCompanies) and period
// semantics (monthly/quarterly/yearly). Actual aggregation lives in
// aggregateStaffInsights.ts so this route and its Excel export
// (staff-insights/export/route.ts) can never disagree on figures.
import { NextRequest } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { getQuarterFromMonth, type Period } from '@/app/lib/reporting/periodRange'
import { aggregateStaffInsights } from '@/app/lib/reporting/aggregateStaffInsights'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') || 'monthly').toLowerCase() as Period
    const requestedCompanyId = searchParams.get('companyId')

    const year = Number(searchParams.get('year') || new Date().getFullYear())
    const month = Number(searchParams.get('month') || new Date().getMonth() + 1)
    const quarter = Number(searchParams.get('quarter') || getQuarterFromMonth(month))

    if (!['monthly', 'quarterly', 'yearly'].includes(period)) {
      return withCors(ApiResponse.error('Invalid period. Use monthly, quarterly, or yearly', 400), origin)
    }
    if (!Number.isInteger(year) || year < 1900 || year > 3000) {
      return withCors(ApiResponse.error('Year must be a valid number', 400), origin)
    }

    const accessibleCompanies = await getAccessibleCompanies(user)
    if (accessibleCompanies.length === 0) {
      return withCors(ApiResponse.error('No companies assigned to your account', 403), origin)
    }

    const { targetCompanyIds, resolvedCompanyId, error } = resolveTargetCompanies(user, requestedCompanyId, accessibleCompanies)
    if (error) return withCors(ApiResponse.error(error, 403), origin)

    const { headcount, movement, tenure, attendance, leave, departments, lifecycle, offboardingFunnel, devices, loansBenefits, structure } = await aggregateStaffInsights({
      targetCompanyIds,
      period,
      year,
      month,
      quarter
    })

    return withCors(
        ApiResponse.success(
            {
              filters: {
                companyId: resolvedCompanyId,
                requestedCompanyId: requestedCompanyId || null,
                period,
                year,
                month: period === 'monthly' ? month : null,
                quarter: period === 'quarterly' ? quarter : null
              },
              companyContext: {
                role: user.role,
                accessibleCompanies,
                selectedCompanyId: resolvedCompanyId
              },
              headcount,
              movement,
              tenure,
              attendance,
              leave,
              departments,
              lifecycle,
              offboardingFunnel,
              devices,
              loansBenefits,
              structure
            },
            'Staff insights fetched successfully'
        ),
        origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
