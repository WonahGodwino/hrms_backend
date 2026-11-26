// PUBLIC: the new hire enters the 6-digit code from their email.
//   POST { token, code } -> a 2-hour session token for this onboarding (sent back as X-Onboarding-Session).
import { NextRequest } from 'next/server'
import { ApiResponse } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { allow, clientIp, limiters, otpFail, verifyOtpCode } from '@/app/lib/candidate-portal/core'
import { candidateEmailOf, publicOnboardingErrorResponse, resolveOnboardingLink } from '@/app/lib/onboarding/public-access'
import { ONBOARDING_SESSION_TTL_S, signOnboardingSession } from '@/app/lib/onboarding/response-token'
import { readJsonBody } from '@/app/lib/validation/request-body'
import { onboardingCodeVerifySchema } from '@/app/lib/validation/onboarding-public-schemas'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    if (!(await allow(limiters.window, 20, `onb-verify:ip:${clientIp(request)}`))) {
      return withCors(ApiResponse.error('Too many attempts. Please try again later.', 429), origin)
    }
    const body = await readJsonBody(request, onboardingCodeVerifySchema)
    if (!body.ok) return withCors(ApiResponse.error(body.message, 400), origin)

    const ctx = await resolveOnboardingLink(body.data.token)
    const email = candidateEmailOf(ctx)
    const result = await verifyOtpCode('STATUS_LOOKUP', email, body.data.code)
    if (result !== 'ok') return withCors(ApiResponse.error(otpFail(result), 400), origin)

    const session = signOnboardingSession({ onboardingId: ctx.onboarding.id, candidateId: ctx.candidate.id, email })
    return withCors(ApiResponse.success({ session, expiresIn: ONBOARDING_SESSION_TTL_S }, 'Verified.'), origin)
  } catch (error) { return withCors(publicOnboardingErrorResponse(error, request), origin) }
}
