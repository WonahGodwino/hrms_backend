// src/app/api/offer-letters/bulk-jobs/status/[id]/route.ts
//
// GET — shared polling target for any offer-letter bulk job (CREATE or
// EDIT). The status/summary shape is identical either way.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access'

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
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params

    const job = await prisma.offerLetterBulkJob.findUnique({ where: { id } })
    if (!job) {
      return withCors(ApiResponse.error('Bulk job not found', 404), origin)
    }

    const hasAccess = await validateOfferLetterCompanyAccess(user, job.companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    if (job.status === 'PENDING' || job.status === 'PROCESSING') {
      return withCors(
        ApiResponse.success({ jobId: job.id, jobType: job.jobType, status: job.status }, 'Bulk job is still processing'),
        origin
      )
    }

    if (job.status === 'FAILED') {
      return withCors(
        ApiResponse.success(
          { jobId: job.id, jobType: job.jobType, status: 'FAILED', failureReason: job.failureReason },
          'Bulk job failed'
        ),
        origin
      )
    }

    return withCors(
      ApiResponse.success(
        {
          jobId: job.id,
          jobType: job.jobType,
          status: 'COMPLETED',
          summary: { totalRecords: job.totalRecords, successful: job.successful, failed: job.failed },
          errors: job.errors || [],
        },
        'Bulk job completed'
      ),
      origin
    )
  } catch (error) {
    console.error('[OFFER_LETTER_BULK_JOB_STATUS] Error:', error)
    return withCors(handleApiError(error), origin)
  }
}
