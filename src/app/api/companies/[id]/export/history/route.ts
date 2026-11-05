// src/app/api/companies/[id]/export/history/route.ts
//
// Lists past Company Export jobs for one company — visibility into who
// exported what and when, and doubles as the audit trail for the
// includeSensitiveData toggle (see CompanyExportJob in schema.prisma).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateCompanyAccess } from '@/app/lib/departments/department-utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
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

    const jobs = await prisma.companyExportJob.findMany({
      where: { companyId: params.id },
      orderBy: { startedAt: 'desc' },
      take: 50
    })

    const requesterIds = Array.from(new Set(jobs.map((j) => j.requestedBy)))
    const requesters = requesterIds.length
      ? await prisma.staffRecord.findMany({ where: { id: { in: requesterIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
      : []
    const requesterMap = new Map(requesters.map((r) => [r.id, `${r.firstName} ${r.lastName}`.trim() || r.email]))

    return withCors(
      ApiResponse.success(
        jobs.map((j) => ({
          id: j.id,
          status: j.status,
          domains: j.domains,
          includeSensitiveData: j.includeSensitiveData,
          requestedBy: requesterMap.get(j.requestedBy) || j.requestedBy,
          rowCounts: j.rowCounts,
          errorMessage: j.errorMessage,
          startedAt: j.startedAt,
          completedAt: j.completedAt
        }))
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
