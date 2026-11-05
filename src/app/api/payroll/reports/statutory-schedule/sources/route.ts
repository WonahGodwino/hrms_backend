// src/app/api/payroll/reports/statutory-schedule/sources/route.ts
//
// Payrolls the statutory schedule can be generated for: completed uploads and
// approved generation runs, the same set as the Pension and Bank Schedules.
import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getAccessibleCompanies } from '@/app/lib/reporting/access'
import { listBankScheduleSources } from '@/app/lib/payroll/reports/bank-schedule'

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
    const requestedCompanyId = searchParams.get('companyId')
    let companyIds = accessibleIds
    if (requestedCompanyId) {
      if (!companyIds.includes(requestedCompanyId)) {
        return withCors(ApiResponse.error('Access denied to selected company', 403), origin)
      }
      companyIds = [requestedCompanyId]
    }

    const sources = await listBankScheduleSources(companyIds)
    return withCors(ApiResponse.success({ sources, companies: accessibleCompanies }, 'Statutory schedule sources retrieved'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
