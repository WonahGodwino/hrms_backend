// src/app/api/payroll/reports/statutory-schedule/trend/route.ts
//
// Month by month NSITF / ITF / NHF totals (default: the 12 months up to the
// given ?year&month, or up to the latest month with payroll data).
import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getAccessibleCompanies } from '@/app/lib/reporting/access'
import { buildStatutoryTrend } from '@/app/lib/payroll/reports/statutory-schedule'

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
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { searchParams } = new URL(request.url)
    const accessibleCompanies = await getAccessibleCompanies(user)
    if (accessibleCompanies.length === 0) {
      return withCors(ApiResponse.error('No companies assigned to your account', 403), origin)
    }
    const accessibleIds = accessibleCompanies.map((c) => c.companyId)
    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return withCors(ApiResponse.error('companyId is required', 400), origin)
    }
    if (!accessibleIds.includes(companyId)) {
      return withCors(ApiResponse.error('Access denied to selected company', 403), origin)
    }
    const year = Number(searchParams.get('year')) || undefined
    const month = Number(searchParams.get('month')) || undefined
    const months = Math.min(Math.max(Number(searchParams.get('months')) || 12, 1), 36)

    const trend = await buildStatutoryTrend({ companyIds: [companyId], endYear: year, endMonth: month, months })
    return withCors(ApiResponse.success(trend, 'Statutory trend retrieved'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
