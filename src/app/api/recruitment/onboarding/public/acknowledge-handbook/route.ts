// PUBLIC candidate handbook acknowledgment (no login).
//   POST { token } → idempotently records that the candidate read the handbook.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import rateLimit from '@/app/lib/rateLimiter'
import { verifyOnboardingResponseToken } from '@/app/lib/onboarding/response-token'

const ipLimiter = rateLimit({ interval: 60 * 1000, uniqueTokenPerInterval: 5000 })

const clientIp = (request: NextRequest) =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  request.headers.get('x-real-ip') ||
  'unknown'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    try {
      await ipLimiter.check(20, `onboarding-ack:ip:${clientIp(request)}`)
    } catch {
      return withCors(ApiResponse.error('Too many attempts. Please try again shortly.', 429), origin)
    }

    const body = await request.json().catch(() => ({}))
    const claims = verifyOnboardingResponseToken(String(body.token || ''))
    if (!claims) {
      return withCors(ApiResponse.error('This link is invalid or has expired.', 400), origin)
    }

    const onboarding = await prisma.onboarding.findUnique({
      where: { id: claims.onboardingId },
      include: { application: { select: { candidateId: true } } },
    })
    if (!onboarding || (claims.candidateId && (onboarding.application as any)?.candidateId !== claims.candidateId)) {
      return withCors(ApiResponse.error('Onboarding not found.', 404), origin)
    }
    if (onboarding.offerId) {
      return withCors(ApiResponse.error('This step is already complete.', 409), origin)
    }
    if (onboarding.status === 'CANCELLED') {
      return withCors(ApiResponse.error('This onboarding has been cancelled.', 409), origin)
    }

    if (!onboarding.handbookAcknowledgedAt) {
      await prisma.onboarding.update({
        where: { id: onboarding.id },
        data: { handbookAcknowledgedAt: new Date(), updatedBy: 'candidate' },
      })
    }

    return withCors(ApiResponse.success({ handbookAcknowledged: true }, 'Thanks — handbook acknowledged.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
