// POST /api/recruitment/onboarding/:id/send-welcome
// Emails the candidate their secure link to the pre-offer onboarding page
// (company handbook, checklist, final agreement). Uses the existing Mailgun
// sendEmail service via the shared system email template.
import { NextRequest } from 'next/server'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { sendOnboardingWelcomeEmail } from '@/app/lib/onboarding/welcome-email'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const onboarding = await forCompany(companyId).onboarding.findFirst({
      where: { id },
      include: { application: { select: { candidate: true } }, company: { select: { companyName: true, tradingName: true } } },
    })
    if (!onboarding) return withCors(ApiResponse.error('Onboarding not found', 404), origin)

    const candidate = (onboarding.application as any)?.candidate
    if (!candidate?.email) return withCors(ApiResponse.error('New hire has no email on file', 400), origin)

    const companyName = onboarding.company?.tradingName || onboarding.company?.companyName || 'the company'
    const result = await sendOnboardingWelcomeEmail({
      onboardingId: id,
      companyId,
      candidate,
      companyName,
      hasOffer: !!onboarding.offerId,
      sentBy: user.userId,
    })

    if (!result.success) return withCors(ApiResponse.error(result.error || 'Failed to send welcome email', 502), origin)
    return withCors(ApiResponse.success({ onboardingId: id, recipient: candidate.email }, 'Welcome link sent.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
