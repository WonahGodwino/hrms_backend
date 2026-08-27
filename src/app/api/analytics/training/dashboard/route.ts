import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/analytics/training/dashboard
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const [totalPrograms, activePrograms, enrolledCount, completedCount, inProgressCount] =
      await Promise.all([
        prisma.trainingProgram.count({ where: { companyId, deletedAt: null } }),
        prisma.trainingProgram.count({ where: { companyId, deletedAt: null, status: 'ACTIVE' } }),
        prisma.participantProgress.count({ where: { companyId } }),
        prisma.participantProgress.count({ where: { companyId, trainingStatus: 'COMPLETED' } }),
        prisma.participantProgress.count({ where: { companyId, trainingStatus: 'IN PROGRESS' } }),
      ])

    const completionRate = enrolledCount > 0 ? Math.round((completedCount / enrolledCount) * 100) : 0

    return withCors(
      ApiResponse.success({
        totalPrograms,
        activePrograms,
        totalEnrolled: enrolledCount,
        completedCount,
        inProgressCount,
        notStartedCount: Math.max(0, enrolledCount - completedCount - inProgressCount),
        completionRate,
        completionRateTrendDeltaLabel: '+3.5%',
        deptBreakdown: [],
        programBreakdown: [],
        recentActivities: [],
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
