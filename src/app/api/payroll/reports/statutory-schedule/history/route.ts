// src/app/api/payroll/reports/statutory-schedule/history/route.ts
//
// One staff member's month by month NSITF / ITF / NHF coverage, with skipped
// stretches (ongoing, or resolved in a later month).
import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getAccessibleCompanies } from '@/app/lib/reporting/access'
import { getStaffStatutoryHistory } from '@/app/lib/payroll/reports/statutory-schedule'

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
    const staffRecordId = searchParams.get('staffRecordId')
    if (!staffRecordId) {
      return withCors(ApiResponse.error('staffRecordId is required', 400), origin)
    }

    const history = await getStaffStatutoryHistory(staffRecordId, companyId)
    if (!history) {
      return withCors(ApiResponse.error('Staff member not found', 404), origin)
    }
    return withCors(ApiResponse.success(history, 'Statutory coverage history retrieved'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
