// src/app/api/payroll/generate/history/route.ts
//
// Lists past Payroll Generation runs for a company — the landing page's
// history table. Mirrors the existing /payroll/upload/history endpoint's
// shape/intent without sharing code with it.
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
    if (!companyId) {
      return withCors(ApiResponse.error('Company selection is required', 400), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    const runs = await prisma.payrollGenerationRun.findMany({
      where: { companyId },
      include: { template: { select: { templateName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    // Collect unique user IDs to resolve names in one query
    const userIds = [...new Set(
      [...runs.map((r) => r.triggeredBy), ...runs.map((r) => r.approvedBy)].filter((id): id is string => Boolean(id))
    )]
    const users = userIds.length > 0
      ? await prisma.staffRecord.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true }
        })
      : []
    const userMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || u.email]))

    return withCors(
      ApiResponse.success(
        runs.map((r) => ({
          id: r.id,
          templateId: r.templateId,
          templateName: r.template.templateName,
          payPeriod: r.payPeriod,
          status: r.status,
          totalStaff: r.totalStaff,
          flaggedCount: r.flaggedCount,
          triggeredBy: userMap.get(r.triggeredBy) || r.triggeredBy,
          approvedBy: r.approvedBy ? (userMap.get(r.approvedBy) || r.approvedBy) : null,
          approvedAt: r.approvedAt,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        })),
        'Payroll generation history retrieved'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
