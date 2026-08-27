import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/training-programs/insights?companyId=
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
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [totalPrograms, programsThisMonth, activePrograms, mandatoryPrograms, participantStats, upcomingDeadlines] =
      await Promise.all([
        prisma.trainingProgram.count({
          where: { companyId, deletedAt: null },
        }),
        prisma.trainingProgram.count({
          where: { companyId, deletedAt: null, createdAt: { gte: startOfMonth } },
        }),
        prisma.trainingProgram.count({
          where: { companyId, deletedAt: null, status: 'ACTIVE' },
        }),
        prisma.trainingProgram.count({
          where: { companyId, deletedAt: null, category: { contains: 'Mandatory', mode: 'insensitive' } },
        }),
        prisma.participantProgress.aggregate({
          where: { companyId },
          _avg: { progressPct: true },
        }),
        prisma.trainingProgram.findMany({
          where: {
            companyId,
            deletedAt: null,
            status: 'ACTIVE',
            dueDate: { gte: now },
          },
          select: {
            id: true,
            programName: true,
            dueDate: true,
          },
          orderBy: { dueDate: 'asc' },
          take: 5,
        }),
      ])

    const avgCompletion = Math.round(participantStats._avg.progressPct ?? 0)

    const deadlines = upcomingDeadlines.map((p) => {
      const diffMs = p.dueDate.getTime() - now.getTime()
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      const dueIn = diffDays <= 0 ? 'Due today' : `Due in ${diffDays} day${diffDays === 1 ? '' : 's'}`

      return {
        id: p.id,
        name: p.programName,
        dueIn,
        dueDate: p.dueDate.toISOString().split('T')[0],
      }
    })

    return withCors(
      ApiResponse.success({
        totalPrograms,
        totalProgramsTrend: `+${programsThisMonth} this month`,
        activePrograms,
        mandatoryPrograms,
        avgCompletion,
        avgCompletionTrend: '+4%',
        deadlines,
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
