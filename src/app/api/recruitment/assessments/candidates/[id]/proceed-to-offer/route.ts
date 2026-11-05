// POST /api/recruitment/assessments/candidates/:id/proceed-to-offer
// Once a candidate clears their final interview round, this starts the
// pre-offer onboarding stage (company handbook, role/day-to-day checklist,
// final compliance agreement) instead of immediately creating an Offer. The
// Offer itself is only created later, once that stage is ready — see
// onboarding/[id]/generate-offer.
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
    const body = await request.json().catch(() => ({}))
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || body.companyId || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const templateId = String(body.templateId || '').trim()
    if (!templateId) return withCors(ApiResponse.error('templateId is required — pick an onboarding template', 400), origin)

    const assessment = await prisma.recruitmentCandidateAssessment.findUnique({
      where: { id: params.id },
      include: {
        plan: { include: { rounds: { orderBy: { order: 'asc' } } } },
        application: { select: { id: true, candidateId: true, jobId: true, onboarding: { select: { id: true } } } },
      },
    })
    if (!assessment) return withCors(ApiResponse.error('Candidate assessment not found', 404), origin)

    if (assessment.currentRoundOrder !== assessment.plan.rounds.length)
      return withCors(ApiResponse.error('Candidate must be on the final round', 400), origin)
    if (assessment.roundStatus !== 'COMPLETED')
      return withCors(ApiResponse.error('Round must be completed before proceeding to offer', 400), origin)

    const template = await prisma.onboardingTemplate.findFirst({
      where: { id: templateId, companyId, status: 'ACTIVE' },
      include: { tasks: { orderBy: { order: 'asc' } } },
    })
    if (!template) return withCors(ApiResponse.error('Onboarding template not found or not active', 404), origin)

    const actor = user.userId || user.email || 'system'

    await prisma.recruitmentCandidateAssessment.update({
      where: { id: params.id }, data: { roundStatus: 'COMPLETED' },
    })
    await prisma.jobApplication.update({
      where: { id: assessment.applicationId }, data: { status: 'PRE_OFFER_ONBOARDING', updatedBy: actor },
    })

    // Idempotent — reuse the existing pre-offer onboarding for this
    // application if proceed-to-offer was already called once.
    let onboardingId = assessment.application?.onboarding?.id || null
    if (!onboardingId) {
      const now = new Date()
      const onboarding = await prisma.onboarding.create({
        data: {
          companyId,
          applicationId: assessment.applicationId,
          templateId: template.id,
          status: 'IN_PROGRESS',
          startDate: now,
          createdBy: actor,
        },
        select: { id: true },
      })
      onboardingId = onboarding.id

      if (template.tasks.length) {
        await prisma.onboardingTask.createMany({
          data: template.tasks.map((t) => ({
            onboardingId: onboarding.id,
            title: t.title,
            description: t.description || undefined,
            department: t.category || undefined,
            assigneeId: t.assignee || undefined,
            dueDate: t.dueOffsetDays != null ? new Date(now.getTime() + t.dueOffsetDays * 86400000) : undefined,
            createdBy: actor,
          })),
        })
      }
    }

    return withCors(ApiResponse.success({
      candidateId: assessment.application?.candidateId,
      applicationId: assessment.applicationId,
      onboardingId,
      roundStatus: 'COMPLETED', status: 'PRE_OFFER_ONBOARDING',
    }, 'Candidate approved. Pre-offer onboarding started.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
