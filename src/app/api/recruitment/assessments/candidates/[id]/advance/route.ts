// POST /api/recruitment/assessments/candidates/:id/advance
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const where: any = { id: params.id }
    if (companyId) where.companyId = companyId

    const assessment = await prisma.recruitmentCandidateAssessment.findUnique({
      where: { id: params.id },
      include: { plan: { include: { rounds: { orderBy: { order: 'asc' } } } } },
    })
    if (!assessment) return withCors(ApiResponse.error('Candidate assessment not found', 404), origin)

    if (assessment.roundStatus !== 'COMPLETED')
      return withCors(ApiResponse.error('All interviewers must submit feedback before advancing', 400), origin)

    const totalRounds = assessment.plan.rounds.length
    if (assessment.currentRoundOrder >= totalRounds)
      return withCors(ApiResponse.error('Candidate is already on the final round', 400), origin)

    const nextOrder = assessment.currentRoundOrder + 1
    const nextRound = assessment.plan.rounds.find(r => r.order === nextOrder)

    await prisma.recruitmentCandidateAssessment.update({
      where: { id: params.id },
      data: { currentRoundOrder: nextOrder, roundStatus: 'AWAITING_SCHEDULING' },
    })

    return withCors(ApiResponse.success({
      currentRound: { id: nextRound?.id, order: nextRound?.order, title: nextRound?.title },
      roundStatus: 'awaiting_scheduling',
    }, `Candidate advanced to Round ${nextOrder}: ${nextRound?.title || 'Unknown'}.`), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
