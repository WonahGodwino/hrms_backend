// src/app/api/payroll/payslips/bulk-send/status/[id]/route.ts
//
// GET — polling target for an async payslip bulk-send job. Returns the
// current status, and once COMPLETED/FAILED, the send summary.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { id } = await params

    const job = await prisma.payslipBulkSend.findUnique({ where: { id } })
    if (!job) {
      return withCors(ApiResponse.error('Bulk-send job not found', 404), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, job.companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    if (job.status === 'PENDING' || job.status === 'PROCESSING') {
      return withCors(
        ApiResponse.success({ jobId: job.id, status: job.status }, 'Payslip bulk-send is still processing'),
        origin
      )
    }

    if (job.status === 'FAILED') {
      return withCors(
        ApiResponse.success(
          { jobId: job.id, status: 'FAILED', failureReason: job.failureReason },
          'Payslip bulk-send failed'
        ),
        origin
      )
    }

    return withCors(
      ApiResponse.success(
        {
          jobId: job.id,
          status: 'COMPLETED',
          month: job.month,
          year: job.year,
          summary: {
            totalPayslips: job.totalPayslips,
            sent: job.sent,
            failed: job.failed,
          },
          emailFailures: job.emailFailures || [],
        },
        'Payslip bulk-send completed'
      ),
      origin
    )
  } catch (error) {
    console.error('[PAYSLIP_BULK_SEND_STATUS] Error:', error)
    return withCors(handleApiError(error), origin)
  }
}
