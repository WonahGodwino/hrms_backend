// src/app/api/payroll/reports/bank-schedule/sources/route.ts
//
// Lists the payrolls the Bank Schedule can be generated for — completed
// PayrollUploads and approved PayrollGenerationRuns across the caller's
// accessible companies, newest first. Feeds the Finance Report page's
// Bank Schedule tab source picker.
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
    const requestedCompanyId = searchParams.get('companyId')

    const accessibleCompanies = await getAccessibleCompanies(user)
    if (accessibleCompanies.length === 0) {
      return withCors(ApiResponse.error('No companies assigned to your account', 403), origin)
    }

    // Optional ?companyId= filter — SUPER_ADMIN narrowing, or an ADMIN with
    // several companies picking one. Validated against the accessible set.
    let companyIds = accessibleCompanies.map((c) => c.companyId)
    if (requestedCompanyId) {
      if (!companyIds.includes(requestedCompanyId)) {
        return withCors(ApiResponse.error('Access denied to selected company', 403), origin)
      }
      companyIds = [requestedCompanyId]
    }

    const sources = await listBankScheduleSources(companyIds)

    return withCors(
      ApiResponse.success(
        {
          sources,
          companies: accessibleCompanies,
          companyFilterApplied: !!requestedCompanyId
        },
        'Bank schedule sources retrieved'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
