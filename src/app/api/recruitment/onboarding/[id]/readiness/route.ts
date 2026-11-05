// GET /api/recruitment/onboarding/:id/readiness
// Reports whether a pre-offer onboarding has cleared every gate required
// before HR can generate the offer: every checklist task DONE, the handbook
// acknowledged, and the candidate's final compliance agreement given.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const onboarding = await prisma.onboarding.findFirst({ where: { id, companyId } })
    if (!onboarding) return withCors(ApiResponse.error('Onboarding not found', 404), origin)

    const [totalTasks, openTasks] = await Promise.all([
      prisma.onboardingTask.count({ where: { onboardingId: id, archived: 0 } }),
      prisma.onboardingTask.count({ where: { onboardingId: id, archived: 0, status: { not: 'DONE' } } }),
    ])

    const tasksComplete = totalTasks > 0 && openTasks === 0
    const handbookAcknowledged = !!onboarding.handbookAcknowledgedAt
    const candidateAgreed = !!onboarding.candidateAgreedAt
    const ready = tasksComplete && handbookAcknowledged && candidateAgreed && !onboarding.offerId

    return withCors(ApiResponse.success({
      tasksComplete,
      totalTasks,
      openTasks,
      handbookAcknowledged,
      candidateAgreed,
      offerAlreadyGenerated: !!onboarding.offerId,
      ready,
    }, 'OK'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
