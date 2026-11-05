// src/app/api/payroll/reports/pension-schedule/gaps/route.ts
//
// Company-wide list of staff with an open or previously-resolved pension
// compliance gap (missing RSA PIN/PFA Code/Employer Code for one or more
// tracked payroll periods). Feeds the Pension Schedule tab's "Compliance
// gaps" view — click-through pre-fills the per-staff history/picker.
import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getAccessibleCompanies } from '@/app/lib/reporting/access'
import { getCompanyPensionGaps } from '@/app/lib/payroll/reports/pension-history'

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
    if (!companyId) {
      return withCors(ApiResponse.error('companyId is required', 400), origin)
    }

    const accessibleCompanies = await getAccessibleCompanies(user)
    const companyIds = accessibleCompanies.map((c) => c.companyId)
    if (!companyIds.includes(companyId)) {
      return withCors(ApiResponse.error('Access denied to selected company', 403), origin)
    }

    const gaps = await getCompanyPensionGaps(companyId)

    return withCors(ApiResponse.success({ gaps }, 'Pension compliance gaps retrieved'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
