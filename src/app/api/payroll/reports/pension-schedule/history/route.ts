// src/app/api/payroll/reports/pension-schedule/history/route.ts
//
// One staff member's pension-detail compliance timeline across every payroll
// they appear in — month-by-month complete/missing/not-tracked status plus
// detected gap segments (missing-from / resolved-at). Only payrolls created
// after the pension snapshot columns shipped carry tracked data; see
// pension-history.ts for why older rows can't be reconstructed.
import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getAccessibleCompanies } from '@/app/lib/reporting/access'
import { getStaffPensionHistory } from '@/app/lib/payroll/reports/pension-history'

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
    const staffRecordId = searchParams.get('staffRecordId')
    const companyId = searchParams.get('companyId')

    if (!staffRecordId || !companyId) {
      return withCors(ApiResponse.error('staffRecordId and companyId are required', 400), origin)
    }

    const accessibleCompanies = await getAccessibleCompanies(user)
    const companyIds = accessibleCompanies.map((c) => c.companyId)
    if (!companyIds.includes(companyId)) {
      return withCors(ApiResponse.error('Access denied to selected company', 403), origin)
    }

    const history = await getStaffPensionHistory(staffRecordId, companyId)
    if (!history) {
      return withCors(ApiResponse.error('Staff record not found or not accessible', 404), origin)
    }

    return withCors(ApiResponse.success(history, 'Pension history retrieved'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
