import { NextRequest } from 'next/server'

import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/training-programs/dashboard-stats?companyId=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000)

    const [
      activeTrainings,
      totalPrograms,
      employeesEnrolled,
      completed,
      total,
      overdue,
      prevPeriodActive,
      prevPeriodEnrolled,
    ] = await Promise.all([
      forCompany(companyId).trainingProgram.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      forCompany(companyId).trainingProgram.count({ where: { deletedAt: null } }),
      forCompany(companyId).participantProgress.count(),
      forCompany(companyId).participantProgress.count({ where: { trainingStatus: 'COMPLETED' } }),
      forCompany(companyId).participantProgress.count(),
      forCompany(companyId).participantProgress.count({
        where: { trainingStatus: { in: ['NOT STARTED', 'IN PROGRESS'] }, dueDate: { lt: now } },
      }),
      forCompany(companyId).trainingProgram.count({ where: { status: 'ACTIVE', deletedAt: null, createdAt: { lt: thirtyDaysAgo } } }),
      forCompany(companyId).participantProgress.count({ where: { createdAt: { lt: thirtyDaysAgo } } }),
    ])

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

    return withCors(
      ApiResponse.success({
        activeTrainings,
        totalPrograms,
        employeesEnrolled,
        completionRate,
        overdueTrainings: overdue,
        trends: {
          activeTrainings: prevPeriodActive > 0 ? Math.round(((activeTrainings - prevPeriodActive) / prevPeriodActive) * 100) : 0,
          employeesEnrolled: prevPeriodEnrolled > 0 ? Math.round(((employeesEnrolled - prevPeriodEnrolled) / prevPeriodEnrolled) * 100) : 0,
        },
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
