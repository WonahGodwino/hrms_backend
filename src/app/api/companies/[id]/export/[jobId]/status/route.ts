// src/app/api/companies/[id]/export/[jobId]/status/route.ts
//
// Polling endpoint for a Company Export job — the frontend hits this every
// few seconds while status is PROCESSING, same pattern as every other
// background-job status route in this codebase.
import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateCompanyAccess } from '@/app/lib/departments/department-utils'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string; jobId: string }> }
) {
  const params = await props.params;
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const hasAccess = await validateCompanyAccess(user, params.id)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const job = await forCompany(params.id).companyExportJob.findFirst({ where: { id: params.jobId } })
    if (!job) {
      return withCors(ApiResponse.error('Export job not found', 404), origin)
    }

    return withCors(
      ApiResponse.success({
        status: job.status,
        domains: job.domains,
        rowCounts: job.rowCounts,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt,
        completedAt: job.completedAt
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
