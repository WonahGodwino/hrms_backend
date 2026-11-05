// PUBLIC candidate handbook download (no login).
//   GET ?token=... → streams the company's handbook PDF for the candidate
//                     named on this onboarding's token.
import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import * as path from 'path'
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
      include: { application: { select: { candidateId: true } }, company: { select: { handbookPath: true, handbookFileName: true } } },
    })
    if (!onboarding || (claims.candidateId && (onboarding.application as any)?.candidateId !== claims.candidateId)) {
      return withCors(ApiResponse.error('Onboarding not found.', 404), origin)
    }
    if (!onboarding.company?.handbookPath) {
      return withCors(ApiResponse.error('No company handbook has been uploaded yet.', 404), origin)
    }

    const fullPath = path.join(process.cwd(), 'public', onboarding.company.handbookPath)
    const buffer = await fs.readFile(fullPath).catch(() => null)
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
