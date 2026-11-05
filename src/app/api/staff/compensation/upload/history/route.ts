// src/app/api/staff/compensation/upload/history/route.ts
//
// Lists past Staff Compensation Upload submissions for a company/template —
// so HR can see what was uploaded and when, and re-download the original
// file later via /staff/compensation/upload/history/[id]/download.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'

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
    const templateId = searchParams.get('templateId')

    if (!companyId) {
      return withCors(ApiResponse.error('Company selection is required', 400), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    const uploads = await prisma.staffCompensationUpload.findMany({
      where: { companyId, ...(templateId ? { templateId } : {}) },
      include: { template: { select: { templateName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    // Collect unique uploader IDs to resolve names in one query
    const uploaderIds = [...new Set(uploads.map((u) => u.uploadedBy).filter(Boolean))]
    const uploaders = uploaderIds.length > 0
      ? await prisma.staffRecord.findMany({
          where: { id: { in: uploaderIds } },
          select: { id: true, firstName: true, lastName: true, email: true }
        })
      : []
    const uploaderMap = new Map(uploaders.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || u.email]))

    return withCors(
      ApiResponse.success(
        uploads.map((u) => ({
          id: u.id,
          templateId: u.templateId,
          templateName: u.template.templateName,
          fileName: u.fileName,
          totalRecords: u.totalRecords,
          successful: u.successful,
          failed: u.failed,
          uploadedBy: uploaderMap.get(u.uploadedBy) || u.uploadedBy,
          createdAt: u.createdAt
        })),
        'Upload history retrieved'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
