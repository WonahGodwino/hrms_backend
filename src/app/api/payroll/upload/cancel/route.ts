// src/app/api/payroll/upload/cancel/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { cancelPayrollUpload, validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * POST /api/payroll/upload/cancel
 *
 * Cancels an in-flight payroll upload. Sets the upload status to CANCELLED,
 * marks the in-memory cancellation token so the processing loop stops,
 * and cleans up any payslips that were already created.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { uploadId } = await request.json()
    if (!uploadId) {
      return withCors(ApiResponse.error('uploadId is required', 400), origin)
    }

    const upload = await prisma.payrollUpload.findUnique({ where: { id: uploadId } })
    if (!upload) {
      return withCors(ApiResponse.error('Upload not found', 404), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, upload.companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    // Only allow cancelling uploads that are still in progress
    if (upload.status !== 'PENDING' && upload.status !== 'PROCESSING') {
      return withCors(
        ApiResponse.error(`Cannot cancel upload with status "${upload.status}"`, 400),
        origin
      )
    }

    // Set cancellation token and update DB status
    await cancelPayrollUpload(uploadId)

    // Clean up any payslips created during this upload.
    // Find payslips whose Payroll records were created after this upload started.
    const stalePayrolls = await prisma.payroll.findMany({
      where: {
        companyId: upload.companyId,
        createdAt: { gte: upload.createdAt },
      },
      select: { id: true },
    })
    const stalePayrollIds = stalePayrolls.map(p => p.id)
    
    const deletedPayslips = stalePayrollIds.length > 0
      ? await prisma.payslip.deleteMany({
          where: { payrollId: { in: stalePayrollIds } },
        })
      : { count: 0 }

    console.log(`[PAYROLL_CANCEL] Upload ${uploadId} cancelled. Cleaned up ${deletedPayslips.count} payslip(s).`)

    return withCors(
      ApiResponse.success(
        { uploadId, status: 'CANCELLED', payslipsCleanedUp: deletedPayslips.count },
        'Payroll upload cancelled successfully'
      ),
      origin
    )
  } catch (error) {
    console.error('[PAYROLL_CANCEL] Error:', error)
    return withCors(handleApiError(error), origin)
  }
}
