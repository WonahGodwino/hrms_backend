// src/app/api/payroll/reports/pension-schedule/individual/route.ts
//
// Generates a Pension Schedule for a chosen set of staff across a month/year
// range, instead of being limited to one payroll upload/generation run —
// the "By staff" mode of the Pension Schedule tab. Same 14-column row shape
// as the single-source report; the Excel twin branches on these same
// params in ../download/route.ts.
import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getAccessibleCompanies } from '@/app/lib/reporting/access'
import { buildPensionScheduleForStaff } from '@/app/lib/payroll/reports/pension-schedule'

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
    const companyId = searchParams.get('companyId')
    const staffRecordIds = (searchParams.get('staffRecordIds') || '').split(',').filter(Boolean)
    const fromMonth = parseInt(searchParams.get('fromMonth') || '', 10)
    const fromYear = parseInt(searchParams.get('fromYear') || '', 10)
    const toMonth = parseInt(searchParams.get('toMonth') || '', 10)
    const toYear = parseInt(searchParams.get('toYear') || '', 10)

    if (!companyId || staffRecordIds.length === 0) {
      return withCors(ApiResponse.error('companyId and at least one staffRecordId are required', 400), origin)
    }
    if ([fromMonth, fromYear, toMonth, toYear].some((n) => !Number.isFinite(n))) {
      return withCors(ApiResponse.error('fromMonth, fromYear, toMonth, toYear are required and must be numbers', 400), origin)
    }
    if (fromMonth < 1 || fromMonth > 12 || toMonth < 1 || toMonth > 12) {
      return withCors(ApiResponse.error('fromMonth/toMonth must be between 1 and 12', 400), origin)
    }

    const accessibleCompanies = await getAccessibleCompanies(user)
    const companyIds = accessibleCompanies.map((c) => c.companyId)

    const schedule = await buildPensionScheduleForStaff({ staffRecordIds, companyId, fromMonth, fromYear, toMonth, toYear }, companyIds)
    if (!schedule) {
      return withCors(ApiResponse.error('No accessible payroll data found for the selected staff/period', 404), origin)
    }

    return withCors(ApiResponse.success(schedule, 'Pension schedule retrieved'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
