// Access checks for the new hire's public onboarding page (api/recruitment/onboarding/public/*).
//
// Two steps, both required for anything beyond asking for a code:
//   1. The emailed link token says which onboarding (lib/onboarding/response-token.ts).
//   2. A 6-digit code sent to the candidate's email on record proves the person is the candidate; the page then
//      holds a 2-hour session token (header X-Onboarding-Session) tied to that onboarding, candidate and email.
import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import {
  ONBOARDING_SESSION_HEADER,
  readOnboardingSession,
  verifyOnboardingResponseToken,
} from '@/app/lib/onboarding/response-token'

export class PublicOnboardingError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
    this.name = 'PublicOnboardingError'
  }
}

const include = {
  application: {
    select: {
      candidateId: true,
      candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
      job: { select: { title: true } },
    },
  },
  company: { select: { companyName: true, handbookPath: true, handbookFileName: true } },
} satisfies Prisma.OnboardingInclude

export type PublicOnboarding = Prisma.OnboardingGetPayload<{ include: typeof include }>

export interface PublicOnboardingContext {
  onboarding: PublicOnboarding
  candidate: { id: string; firstName: string; lastName: string; email: string }
}

/** Resolves the link token to an open pre-offer onboarding (no identity check yet). */
export async function resolveOnboardingLink(token: string): Promise<PublicOnboardingContext> {
  const claims = verifyOnboardingResponseToken(token)
  if (!claims) throw new PublicOnboardingError('This link is invalid or has expired.', 400)
  const onboarding = await prisma.onboarding.findUnique({ where: { id: claims.onboardingId }, include })
  const candidate = onboarding?.application?.candidate
  if (!onboarding || !candidate || (claims.candidateId && onboarding.application?.candidateId !== claims.candidateId)) {
    throw new PublicOnboardingError('Onboarding not found.', 404)
  }
  // Only the pre-offer stage uses this link; once an offer exists the next step is the offer-response link.
  if (onboarding.offerId) {
    throw new PublicOnboardingError('This step is already complete. Check your email for the offer letter.', 409)
  }
  if (onboarding.status === 'CANCELLED') throw new PublicOnboardingError('This onboarding has been cancelled.', 409)
  return { onboarding, candidate }
}

/** As resolveOnboardingLink, plus a verified session for the same onboarding, candidate and email. */
export async function requireOnboardingSession(request: NextRequest, token: string): Promise<PublicOnboardingContext> {
  const ctx = await resolveOnboardingLink(token)
  const session = readOnboardingSession(request.headers.get(ONBOARDING_SESSION_HEADER))
  const ok =
    session &&
    session.onboardingId === ctx.onboarding.id &&
    session.candidateId === ctx.candidate.id &&
    session.email === ctx.candidate.email.trim().toLowerCase()
  if (!ok) throw new PublicOnboardingError('Verify your email to continue.', 401, 'ONBOARDING_VERIFY_REQUIRED')
  return ctx
}

export const candidateEmailOf = (ctx: PublicOnboardingContext) => ctx.candidate.email.trim().toLowerCase()

export const candidateNameOf = (ctx: PublicOnboardingContext) =>
  `${ctx.candidate.firstName || ''} ${ctx.candidate.lastName || ''}`.trim() || 'Candidate'

/** The response for an error from these routes: access refusals keep their status and message. */
export function publicOnboardingErrorResponse(error: unknown, request: NextRequest) {
  if (error instanceof PublicOnboardingError) {
    return ApiResponse.error(error.message, error.status, undefined, error.code ? { code: error.code } : undefined)
  }
  return handleApiError(error, request)
}

/** The link token from the query string (GET) or a JSON/form body field. */
export function linkTokenFromQuery(request: NextRequest): string {
  return new URL(request.url).searchParams.get('token') || ''
}
