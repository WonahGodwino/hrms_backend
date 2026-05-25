import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/analytics/training/dashboard?companyId=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId') ?? user.companyId
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.companyId && companyId !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

    const now         = new Date()
    const last30      = new Date(now.getTime() - 30 * 86_400_000)

    const [
      activeTrainings, totalPrograms, employeesEnrolled,
      completed, total, overdue, recentActivity,
    ] = await Promise.all([
      prisma.trainingProgram.count({ where: { companyId, status: 'ACTIVE', deletedAt: null } }),
      prisma.trainingProgram.count({ where: { companyId, deletedAt: null } }),
      prisma.participantProgress.count({ where: { companyId } }),
      prisma.participantProgress.count({ where: { companyId, trainingStatus: 'COMPLETED' } }),
      prisma.participantProgress.count({ where: { companyId } }),
      prisma.participantProgress.count({
        where: { companyId, trainingStatus: { in: ['NOT STARTED', 'IN PROGRESS'] }, dueDate: { lt: now } },
      }),
      prisma.trainingAuditLog.findMany({
        where: { companyId, createdAt: { gte: last30 } },
        include: { actor: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ])

    return withCors(
      ApiResponse.success({
        activeTrainings, totalPrograms, employeesEnrolled,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        overdueTrainings: overdue,
        recentActivity,
      }),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
