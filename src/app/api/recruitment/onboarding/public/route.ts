// PUBLIC (verified new hire): their pre-offer onboarding summary.
//   GET ?token=... -> name, job and company, handbook availability, checklist progress and what they can do next.
// Needs the X-Onboarding-Session header from verify-code (see lib/onboarding/public-access.ts).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { candidateNameOf, linkTokenFromQuery, publicOnboardingErrorResponse, requireOnboardingSession } from '@/app/lib/onboarding/public-access'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const ctx = await requireOnboardingSession(request, linkTokenFromQuery(request))
    const { onboarding } = ctx
    const [totalTasks, doneTasks] = await Promise.all([
      prisma.onboardingTask.count({ where: { onboardingId: onboarding.id, archived: 0 } }),
      prisma.onboardingTask.count({ where: { onboardingId: onboarding.id, archived: 0, status: 'DONE' } }),
    ])
    return withCors(
      ApiResponse.success({
        candidateName: candidateNameOf(ctx),
        jobTitle: onboarding.application?.job?.title || 'the role',
        company: onboarding.company?.companyName || 'the company',
        hasHandbook: !!onboarding.company?.handbookPath,
        handbookFileName: onboarding.company?.handbookFileName || null,
        checklistTotal: totalTasks,
        checklistDone: doneTasks,
        handbookAcknowledged: !!onboarding.handbookAcknowledgedAt,
        candidateAgreed: !!onboarding.candidateAgreedAt,
        canAcknowledgeHandbook: !onboarding.handbookAcknowledgedAt,
        canAgree: !!onboarding.handbookAcknowledgedAt && !onboarding.candidateAgreedAt,
      }, 'OK'),
      origin,
    )
  } catch (error) { return withCors(publicOnboardingErrorResponse(error, request), origin) }
}
