// PUBLIC: the new hire asks for a 6-digit code to open their onboarding page.
//   POST { token } -> emails a code to the candidate's email on record; answers with the masked address.
// The answer never reveals more than the masked email, company and role, and is rate limited per IP and link.
import { NextRequest } from 'next/server'
import { ApiResponse } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { allow, clientIp, CODE_TTL_MS, issueOtp, limiters, maskEmail } from '@/app/lib/candidate-portal/core'
import { mail, onboardingCodeMail } from '@/app/lib/candidate-portal/emails'
import { candidateEmailOf, publicOnboardingErrorResponse, resolveOnboardingLink } from '@/app/lib/onboarding/public-access'
import { readJsonBody } from '@/app/lib/validation/request-body'
import { onboardingCodeRequestSchema } from '@/app/lib/validation/onboarding-public-schemas'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    if (!(await allow(limiters.window, 10, `onb-code:ip:${clientIp(request)}`))) {
      return withCors(ApiResponse.error('Too many requests. Please try again later.', 429), origin)
    }
    const body = await readJsonBody(request, onboardingCodeRequestSchema)
    if (!body.ok) return withCors(ApiResponse.error(body.message, 400), origin)

    const ctx = await resolveOnboardingLink(body.data.token)
    if (!(await allow(limiters.window, 5, `onb-code:onb:${ctx.onboarding.id}`))) {
      return withCors(ApiResponse.error('Too many codes requested. Please try again later.', 429), origin)
    }
    const email = candidateEmailOf(ctx)
    const company = ctx.onboarding.company?.companyName || 'the company'
    // Shares the status-lookup purpose: both only prove control of this email address.
    const issued = await issueOtp({ purpose: 'STATUS_LOOKUP', email, scopeRef: ctx.onboarding.id, ttlMs: CODE_TTL_MS })
    if ('secret' in issued) await mail(email, onboardingCodeMail(issued.secret, company))

    return withCors(
      ApiResponse.success(
        {
          maskedEmail: maskEmail(email),
          company,
          jobTitle: ctx.onboarding.application?.job?.title || 'the role',
          cooldown: 'cooldown' in issued,
        },
        'cooldown' in issued ? 'A code was sent a moment ago. Check your email.' : 'We sent a code to your email.',
      ),
      origin,
    )
  } catch (error) { return withCors(publicOnboardingErrorResponse(error, request), origin) }
}
