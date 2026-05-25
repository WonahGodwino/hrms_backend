import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/analytics/skills?companyId=&tab=Organization&department=&category=
// Returns skill distribution aggregated from training programs' category/level + participant progress
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId') ?? user.companyId
    const category  = searchParams.get('category')
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.companyId && companyId !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

    // Aggregate: per training program category, count participants by level (program.level)
    const programs = await prisma.trainingProgram.findMany({
      where: { companyId, status: 'ACTIVE', deletedAt: null, ...(category && { category }) },
      select: { id: true, category: true, level: true, programName: true },
    })

    const programIds = programs.map(p => p.id)
    const participants = await prisma.participantProgress.findMany({
      where: { companyId, trainingProgramId: { in: programIds } },
      select: { trainingProgramId: true, trainingStatus: true, certStatus: true },
    })

    // Build skills distribution: category → { beginner, intermediate, advanced, total }
    const catMap: Record<string, { beginner: number; intermediate: number; advanced: number; total: number; certified: number }> = {}
    for (const prog of programs) {
      const cat = prog.category
      if (!catMap[cat]) catMap[cat] = { beginner: 0, intermediate: 0, advanced: 0, total: 0, certified: 0 }

      const progParticipants = participants.filter(p => p.trainingProgramId === prog.id)
      catMap[cat].total += progParticipants.length
      catMap[cat].certified += progParticipants.filter(p => p.certStatus === 'CERTIFIED').length

      const count = progParticipants.length
      if (prog.level === 'Beginner')     catMap[cat].beginner     += count
      if (prog.level === 'Intermediate') catMap[cat].intermediate += count
      if (prog.level === 'Advanced')     catMap[cat].advanced     += count
    }

    const distribution = Object.entries(catMap).map(([name, data]) => ({
      name,
      employees:    data.total,
      certified:    data.certified,
      beginner:     data.total > 0 ? Math.round((data.beginner     / data.total) * 100) : 0,
      intermediate: data.total > 0 ? Math.round((data.intermediate / data.total) * 100) : 0,
      advanced:     data.total > 0 ? Math.round((data.advanced     / data.total) * 100) : 0,
    }))

    return withCors(ApiResponse.success({ distribution }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
