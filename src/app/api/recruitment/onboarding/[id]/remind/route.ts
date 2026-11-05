// POST /api/recruitment/onboarding/:id/remind
// Sends the new hire a reminder to complete their outstanding onboarding steps.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { sendEmail } from '@/app/lib/email'
import { signOnboardingResponseToken } from '@/app/lib/onboarding/response-token'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)
    const body = await request.json().catch(() => ({}))

    const onboarding = await prisma.onboarding.findFirst({
      where: { id, companyId },
      include: { application: { select: { candidate: true } }, company: { select: { companyName: true, tradingName: true } } },
    })
    if (!onboarding) return withCors(ApiResponse.error('Onboarding not found', 404), origin)

    const candidate = (onboarding.application as any)?.candidate
    const to = candidate?.email
    if (!to) return withCors(ApiResponse.error('New hire has no email on file', 400), origin)

    const companyName = onboarding.company?.tradingName || onboarding.company?.companyName || 'the company'
    const firstName = candidate?.firstName || 'there'
    const custom = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : ''
    const frontendUrl = (process.env.NEXT_PUBLIC_FRONTEND_URL || process.env.APP_URL || '').replace(/\/$/, '')

    let html: string
    let text: string
    if (custom) {
      html = `<p>Hi ${firstName},</p><p>${custom}</p><p>Best regards,<br/>${companyName}</p>`
      text = `Hi ${firstName},\n\n${custom}\n\nBest regards,\n${companyName}`
    } else if (!onboarding.offerId) {
      const responseToken = signOnboardingResponseToken(onboarding.id, candidate.id)
      const link = frontendUrl ? `${frontendUrl}/onboarding/respond?token=${encodeURIComponent(responseToken)}` : ''
      html = `<p>Hi ${firstName},</p>
         <p>This is a friendly reminder to complete your onboarding steps at ${companyName} — the company handbook and your final agreement — so we can send your offer.</p>
         ${link ? `<p><a href="${link}">Continue onboarding</a></p>` : ''}
         <p>Best regards,<br/>${companyName}</p>`
      text = `Hi ${firstName},\n\nThis is a friendly reminder to complete your onboarding steps at ${companyName} — the company handbook and your final agreement — so we can send your offer.${link ? `\n\n${link}` : ''}\n\nBest regards,\n${companyName}`
    } else {
      html = `<p>Hi ${firstName},</p>
         <p>This is a friendly reminder to complete your onboarding at ${companyName} by uploading your outstanding documents (means of identification, guarantor form, and signed offer letter).</p>
         <p>Best regards,<br/>${companyName}</p>`
      text = `Hi ${firstName},\n\nThis is a friendly reminder to complete your onboarding at ${companyName} by uploading your outstanding documents.\n\nBest regards,\n${companyName}`
    }

    const result = await sendEmail({ to, subject: `Reminder: complete your onboarding at ${companyName}`, html, text })

    try {
      await prisma.emailLog.create({
        data: {
          companyId,
          emailType: 'ONBOARDING_REMINDER',
          recipient: to,
          status: result.success ? 'SENT' : 'FAILED',
          sentBy: user.userId,
          error: result.success ? null : (result.error || 'Failed to send'),
          metadata: { onboardingId: id, candidateId: candidate?.id },
        },
      })
    } catch (logErr) { console.error('Failed to log reminder email (non-critical):', logErr) }

    if (!result.success) return withCors(ApiResponse.error(result.error || 'Failed to send reminder', 502), origin)
    return withCors(ApiResponse.success({ onboardingId: id, recipient: to }, 'Reminder sent.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
