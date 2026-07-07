// POST /api/recruitment/assessment-plans/:id/rounds — add a round
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
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    const plan = await prisma.recruitmentAssessmentPlan.findFirst({
      where: { id: params.id, companyId },
    })
    if (!plan) return withCors(ApiResponse.error('Assessment plan not found', 404), origin)

    const body = await request.json()
    const { title, interviewType, duration } = body

    if (!title?.trim() || !interviewType?.trim())
      return withCors(ApiResponse.error('Title and interview type are required', 400), origin)

    const maxOrder = await prisma.recruitmentAssessmentRound.findFirst({
      where: { planId: params.id },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    const nextOrder = (maxOrder?.order ?? 0) + 1

    const round = await prisma.recruitmentAssessmentRound.create({
      data: {
        planId: params.id, order: nextOrder,
        title: title.trim(), interviewType: interviewType.trim(),
        duration: duration || 30,
      },
    })

    return withCors(ApiResponse.success({
      id: round.id, order: round.order, title: round.title, duration: round.duration,
      interviewType: round.interviewType, requiredInterviewers: [], gradingMetric: null, questionBanks: [],
    }, 'Round added successfully.', 201), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
