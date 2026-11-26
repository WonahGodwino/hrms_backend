// PUBLIC (verified new hire): records that they read the company handbook.
//   POST { token } -> idempotent. Needs the X-Onboarding-Session header from verify-code.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { publicOnboardingErrorResponse, requireOnboardingSession } from '@/app/lib/onboarding/public-access'
import { readJsonBody } from '@/app/lib/validation/request-body'
import { onboardingTokenBodySchema } from '@/app/lib/validation/onboarding-public-schemas'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const body = await readJsonBody(request, onboardingTokenBodySchema)
    if (!body.ok) return withCors(ApiResponse.error(body.message, 400), origin)
    const { onboarding } = await requireOnboardingSession(request, body.data.token)
    if (!onboarding.handbookAcknowledgedAt) {
      await prisma.onboarding.update({
        where: { id: onboarding.id },
        data: { handbookAcknowledgedAt: new Date(), updatedBy: 'candidate' },
      })
    }
    return withCors(ApiResponse.success({ handbookAcknowledged: true }, 'Thanks, handbook acknowledged.'), origin)
  } catch (error) { return withCors(publicOnboardingErrorResponse(error, request), origin) }
}
