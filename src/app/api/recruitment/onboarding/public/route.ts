// PUBLIC candidate pre-offer onboarding summary (no login).
//   GET ?token=... → candidate name, job/company, handbook availability,
//                     checklist progress %, and what the candidate can still do.
// Secured by a signed, expiring token (see lib/onboarding/response-token.ts).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { verifyOnboardingResponseToken } from '@/app/lib/onboarding/response-token'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = new URL(request.url).searchParams.get('token') || ''
    const claims = verifyOnboardingResponseToken(token)
    if (!claims) {
      return withCors(ApiResponse.error('This link is invalid or has expired.', 400), origin)
    }

    const onboarding = await prisma.onboarding.findUnique({
      where: { id: claims.onboardingId },
      include: {
        application: {
          include: {
            candidate: { select: { id: true, firstName: true, lastName: true } },
            job: { select: { title: true } },
          },
        },
        company: { select: { companyName: true, handbookPath: true, handbookFileName: true } },
      },
    })
    if (!onboarding || (claims.candidateId && (onboarding.application as any)?.candidateId !== claims.candidateId)) {
      return withCors(ApiResponse.error('Onboarding not found.', 404), origin)
    }
    // Only the pre-offer stage uses this link — once an offer exists, the
    // candidate's next step is the offer-response link instead.
    if (onboarding.offerId) {
      return withCors(ApiResponse.error('This step is already complete — check your email for the offer letter.', 409), origin)
    }
    if (onboarding.status === 'CANCELLED') {
      return withCors(ApiResponse.error('This onboarding has been cancelled.', 409), origin)
    }

    const candidate = (onboarding.application as any)?.candidate
    const candidateName = candidate ? `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() : 'Candidate'

    const [totalTasks, doneTasks] = await Promise.all([
      prisma.onboardingTask.count({ where: { onboardingId: onboarding.id, archived: 0 } }),
      prisma.onboardingTask.count({ where: { onboardingId: onboarding.id, archived: 0, status: 'DONE' } }),
    ])

    return withCors(
      ApiResponse.success({
        candidateName: candidateName || 'Candidate',
        jobTitle: (onboarding.application as any)?.job?.title || 'the role',
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
  } catch (error) { return withCors(handleApiError(error), origin) }
}
