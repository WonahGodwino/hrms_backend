// src/app/api/payroll/payslips/bulk-send/pending/route.ts
//
// GET /api/payroll/payslips/bulk-send/pending?companyId=
//
// Lets the frontend discover an in-flight bulk-send job for the current
// company on load/refresh, and is also what the bulk-send action checks
// before allowing a new job to start.
import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'
import { getActivePayslipBulkSend } from '@/app/lib/payroll/payslipBulkSend'

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

    const companyId = request.nextUrl.searchParams.get('companyId')
    if (!companyId) {
      return withCors(ApiResponse.error('Company selection is required', 400), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    const active = await getActivePayslipBulkSend(companyId)

    return withCors(
      ApiResponse.success(
        active ? { active: true, jobId: active.id, status: active.status, month: active.month, year: active.year } : { active: false },
        active ? 'A payslip bulk-send is in progress' : 'No payslip bulk-send in progress'
      ),
      origin
    )
  } catch (error) {
    console.error('[PAYSLIP_BULK_SEND_PENDING] Error:', error)
    return withCors(handleApiError(error), origin)
  }
}
