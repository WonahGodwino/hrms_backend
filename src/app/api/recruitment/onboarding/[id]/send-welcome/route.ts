// POST /api/recruitment/onboarding/:id/send-welcome
// Emails the new hire a welcome message with a link to complete their onboarding
// (upload their required documents). Uses the existing Mailgun sendEmail service.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { sendEmail } from '@/app/lib/email'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const onboarding = await prisma.onboarding.findFirst({
      where: { id, companyId },
      include: { offer: { include: { candidate: true, company: { select: { companyName: true, tradingName: true } } } } },
    })
    if (!onboarding) return withCors(ApiResponse.error('Onboarding not found', 404), origin)

    const candidate = onboarding.offer?.candidate
    const to = candidate?.email
    if (!to) return withCors(ApiResponse.error('New hire has no email on file', 400), origin)

    const companyName = (onboarding.offer as any)?.company?.tradingName || (onboarding.offer as any)?.company?.companyName || 'the company'
    const firstName = candidate?.firstName || 'there'
    const portalUrl = (process.env.FRONTEND_URL || process.env.APP_URL || '').replace(/\/$/, '')
    const link = portalUrl ? `${portalUrl}/login` : ''

    const html = `<p>Hi ${firstName},</p>
      <p>Welcome to ${companyName}! To complete your onboarding, please log in to the staff portal and upload your required documents (means of identification, guarantor form, and your signed offer letter).</p>
      ${link ? `<p><a href="${link}">Open the staff portal</a></p>` : ''}
      <p>We look forward to having you on board.</p>
      <p>Best regards,<br/>${companyName}</p>`
    const text = `Hi ${firstName},\n\nWelcome to ${companyName}! To complete your onboarding, please log in to the staff portal and upload your required documents (means of identification, guarantor form, and signed offer letter).${link ? `\n\n${link}` : ''}\n\nBest regards,\n${companyName}`

    const result = await sendEmail({ to, subject: `Welcome to ${companyName} — Complete your onboarding`, html, text })

    try {
      await prisma.emailLog.create({
        data: {
          companyId,
          emailType: 'ONBOARDING_WELCOME',
          recipient: to,
          status: result.success ? 'SENT' : 'FAILED',
          sentBy: user.userId,
          error: result.success ? null : (result.error || 'Failed to send'),
          metadata: { onboardingId: id, candidateId: candidate?.id },
        },
      })
    } catch (logErr) { console.error('Failed to log welcome email (non-critical):', logErr) }

    if (!result.success) return withCors(ApiResponse.error(result.error || 'Failed to send welcome email', 502), origin)
    return withCors(ApiResponse.success({ onboardingId: id, recipient: to }, 'Welcome link sent.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
