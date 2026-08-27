// src/app/api/payroll/upload/status/[id]/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { PAYROLL_TEMPLATES } from '@/app/lib/payroll/templates/types'
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/payroll/upload/status/[id]
 *
 * Polling target for an async payroll upload. Returns the current status,
 * and once COMPLETED/FAILED, the same summary shape the upload endpoint used
 * to return synchronously.
 */
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

    const upload = await prisma.payrollUpload.findUnique({ where: { id } })
    if (!upload) {
      return withCors(ApiResponse.error('Upload not found', 404), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, upload.companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    if (upload.status === 'PENDING' || upload.status === 'PROCESSING') {
      return withCors(
        ApiResponse.success({ uploadId: upload.id, status: upload.status }, 'Payroll upload is still processing'),
        origin
      )
    }

    if (upload.status === 'FAILED') {
      return withCors(
        ApiResponse.success(
          { uploadId: upload.id, status: 'FAILED', failureReason: upload.failureReason },
          'Payroll upload failed'
        ),
        origin
      )
    }

    const templateName =
      upload.templateType === 'DYNAMIC' && upload.templateId
        ? (await prisma.payrollTemplate.findUnique({ where: { id: upload.templateId } }))?.templateName
        : PAYROLL_TEMPLATES[upload.templateType as keyof typeof PAYROLL_TEMPLATES]?.name

    return withCors(
      ApiResponse.success(
        {
          uploadId: upload.id,
          status: 'COMPLETED',
          templateType: upload.templateType,
          templateId: upload.templateId,
          templateName,
          sendEmails: upload.sendEmails,
          overwriteExisting: upload.overwriteExisting,
          summary: {
            totalProcessed: upload.totalRecords,
            successful: upload.successful,
            failed: upload.failed,
            payslipsGenerated: upload.payslipsGenerated ?? 0,
            payslipsUpdated: upload.payslipsUpdated ?? 0,
            emailsSent: upload.emailsSent ?? 0,
            emailAttempts: upload.emailAttempts ?? 0,
            processingTimeMs:
              upload.startedAt && upload.completedAt
                ? upload.completedAt.getTime() - upload.startedAt.getTime()
                : null,
          },
          emailFailures: upload.emailFailures || [],
          failedRecordsCount: upload.failed,
          downloadLinks: {
            failedRecords: upload.processedFilePath ? `/api/payroll/download-failed/${upload.id}` : null,
            original: `/api/payroll/download-original/${upload.id}`,
          },
          filePaths: {
            original: upload.filePath,
            processed: upload.processedFilePath,
          },
        },
        'Payroll processing completed'
      ),
      origin
    )
  } catch (error) {
    console.error('[PAYROLL_UPLOAD_STATUS] Error:', error)
    return withCors(handleApiError(error), origin)
  }
}
