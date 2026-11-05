// src/app/api/payroll/reports/statutory-schedule/gaps/route.ts
//
// Staff whose NSITF / ITF / NHF was skipped in the last N months (default 12).
import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getAccessibleCompanies } from '@/app/lib/reporting/access'
import { getCompanyStatutoryGaps } from '@/app/lib/payroll/reports/statutory-schedule'

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
    const months = Math.min(Math.max(Number(searchParams.get('months')) || 12, 1), 36)
    const gaps = await getCompanyStatutoryGaps(companyId, { months })
    return withCors(ApiResponse.success({ gaps, months }, 'Statutory coverage gaps retrieved'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
