import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

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
    const companyId = searchParams.get('companyId') ?? user.companyId
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.companyId && companyId !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

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
      prisma.trainingProgram.count({ where: { companyId, status: 'ACTIVE', deletedAt: null } }),
      prisma.trainingProgram.count({ where: { companyId, deletedAt: null } }),
      prisma.participantProgress.count({ where: { companyId } }),
      prisma.participantProgress.count({ where: { companyId, trainingStatus: 'COMPLETED' } }),
      prisma.participantProgress.count({ where: { companyId } }),
      prisma.participantProgress.count({
        where: { companyId, trainingStatus: { in: ['NOT STARTED', 'IN PROGRESS'] }, dueDate: { lt: now } },
      }),
      prisma.trainingProgram.count({ where: { companyId, status: 'ACTIVE', deletedAt: null, createdAt: { lt: thirtyDaysAgo } } }),
      prisma.participantProgress.count({ where: { companyId, createdAt: { lt: thirtyDaysAgo } } }),
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
