// PUBLIC (verified new hire): their final agreement that they can perform the job.
//   POST { token, confirm: true } -> idempotent, after the handbook step. Needs the X-Onboarding-Session header.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { publicOnboardingErrorResponse, requireOnboardingSession } from '@/app/lib/onboarding/public-access'
import { readJsonBody } from '@/app/lib/validation/request-body'
import { onboardingAgreeSchema } from '@/app/lib/validation/onboarding-public-schemas'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const body = await readJsonBody(request, onboardingAgreeSchema)
    if (!body.ok) return withCors(ApiResponse.error('confirm must be true to record agreement', 400), origin)
    const { onboarding } = await requireOnboardingSession(request, body.data.token)
    if (!onboarding.handbookAcknowledgedAt) {
      return withCors(ApiResponse.error('Please read and acknowledge the handbook first.', 409), origin)
    }
    if (!onboarding.candidateAgreedAt) {
      await prisma.onboarding.update({
        where: { id: onboarding.id },
        data: { candidateAgreedAt: new Date(), updatedBy: 'candidate' },
      })
    }
    return withCors(ApiResponse.success({ candidateAgreed: true }, 'Thank you, your agreement has been recorded.'), origin)
  } catch (error) { return withCors(publicOnboardingErrorResponse(error, request), origin) }
}
