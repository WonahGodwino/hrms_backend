import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/analytics/training/completion-rate?companyId=&program_id=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId') ?? user.companyId
    const programId = searchParams.get('program_id')
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.companyId && companyId !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

    const where: any = { companyId }
    if (programId) where.trainingProgramId = programId

    const [total, completed, inProgress, notStarted, pending] = await Promise.all([
      prisma.participantProgress.count({ where }),
      prisma.participantProgress.count({ where: { ...where, trainingStatus: 'COMPLETED' } }),
      prisma.participantProgress.count({ where: { ...where, trainingStatus: 'IN PROGRESS' } }),
      prisma.participantProgress.count({ where: { ...where, trainingStatus: 'NOT STARTED' } }),
      prisma.participantProgress.count({ where: { ...where, trainingStatus: 'PENDING' } }),
    ])

    // Per-program breakdown
    const byProgram = await prisma.participantProgress.groupBy({
      by: ['trainingProgramId'],
      where,
      _count: { id: true },
    })

    const programIds = byProgram.map(p => p.trainingProgramId)
    const programs   = await prisma.trainingProgram.findMany({
      where: { id: { in: programIds } },
      select: { id: true, programName: true, status: true },
    })

    const completedPerProgram = await prisma.participantProgress.groupBy({
      by: ['trainingProgramId'],
      where: { ...where, trainingStatus: 'COMPLETED' },
      _count: { id: true },
    })

    const breakdown = byProgram.map(p => {
      const prog      = programs.find(pr => pr.id === p.trainingProgramId)
      const done      = completedPerProgram.find(c => c.trainingProgramId === p.trainingProgramId)?._count.id ?? 0
      const pTotal    = p._count.id
      return {
        programId:      p.trainingProgramId,
        programName:    prog?.programName ?? 'Unknown',
        status:         prog?.status ?? '',
        total:          pTotal,
        completed:      done,
        completionRate: pTotal > 0 ? Math.round((done / pTotal) * 100) : 0,
      }
    })

    return withCors(
      ApiResponse.success({
        overall: { total, completed, inProgress, notStarted, pending, completionRate: total > 0 ? Math.round((completed / total) * 100) : 0 },
        byProgram: breakdown,
      }),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
