// src/app/api/admin/dashboard/reporting/attendance/route.ts
//
// GET — Attendance Reporting's Summary tab: overall/late rate, by-department
// and by-day-of-week breakdowns, and threshold-based flags (chronic late
// arrivals, below-department-average, and a positive recognition list) —
// all computed via the shared aggregateAttendancePeriod helper, which uses
// each company's real work-week/holiday calendar as the denominator instead
// of just counting whatever Attendance rows happen to exist.
import { NextRequest } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aggregateAttendancePeriod } from '@/app/lib/reporting/aggregateAttendancePeriod'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { getPeriodRange, getQuarterFromMonth, type Period } from '@/app/lib/reporting/periodRange'
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

    const { start, end } = getPeriodRange(period, year, month, quarter)
    const aggregate = await aggregateAttendancePeriod(targetCompanyIds, start, end)

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
          companyContext: { role: user.role, accessibleCompanies, selectedCompanyId: resolvedCompanyId },
          ...aggregate
        },
        'Attendance report fetched successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
