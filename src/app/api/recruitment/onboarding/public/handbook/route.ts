// PUBLIC candidate handbook download (no login).
//   GET ?token=... → streams the company's handbook PDF for the candidate
//                     named on this onboarding's token.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { verifyOnboardingResponseToken } from '@/app/lib/onboarding/response-token'
import { readPrivateFile } from '@/app/lib/storage/private-files'

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
      include: { application: { select: { candidateId: true } }, company: { select: { handbookPath: true, handbookFileName: true } } },
    })
    if (!onboarding || (claims.candidateId && (onboarding.application as any)?.candidateId !== claims.candidateId)) {
      return withCors(ApiResponse.error('Onboarding not found.', 404), origin)
    }
    if (!onboarding.company?.handbookPath) {
      return withCors(ApiResponse.error('No company handbook has been uploaded yet.', 404), origin)
    }

    // Private location first, then the legacy public/ location (SEC-019).
    const buffer = await readPrivateFile(onboarding.company.handbookPath)
    if (!buffer) return withCors(ApiResponse.error('Handbook file not found', 404), origin)

    return withCors(
      new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${onboarding.company.handbookFileName || 'company-handbook.pdf'}"`,
          'Cache-Control': 'no-store',
        },
      }),
      origin,
    )
  } catch (error) { return withCors(handleApiError(error), origin) }
}
