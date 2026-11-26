// PUBLIC (verified new hire): the company handbook.
//   GET ?token=... -> streams the handbook PDF. Needs the X-Onboarding-Session header from verify-code.
import { NextRequest, NextResponse } from 'next/server'
import { ApiResponse } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { linkTokenFromQuery, publicOnboardingErrorResponse, requireOnboardingSession } from '@/app/lib/onboarding/public-access'
import { readPrivateFile } from '@/app/lib/storage/private-files'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const { onboarding } = await requireOnboardingSession(request, linkTokenFromQuery(request))
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
  } catch (error) { return withCors(publicOnboardingErrorResponse(error, request), origin) }
}
