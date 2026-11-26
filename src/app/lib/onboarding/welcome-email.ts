// Emails a new hire their secure link to the pre-offer onboarding page (or,
// once an offer exists, the staff portal). Shared by the automatic send
// right after pre-offer onboarding starts and the manual "Resend Welcome
// Link" / "Remind" actions on the onboarding command center.
import { prisma } from '@/app/lib/db'
import { sendEmail } from '@/app/lib/email'
import { renderSystemEmailHtml, renderSystemEmailText } from '@/app/lib/email/systemTemplate'
import { signOnboardingResponseToken } from '@/app/lib/onboarding/response-token'

export async function sendOnboardingWelcomeEmail(params: {
  onboardingId: string
  companyId: string
  candidate: { id: string; firstName: string | null; email: string | null }
  companyName: string
  hasOffer: boolean
  sentBy: string
}): Promise<{ success: boolean; error?: string }> {
  const { onboardingId, companyId, candidate, companyName, hasOffer, sentBy } = params
  const to = candidate.email
  if (!to) return { success: false, error: 'New hire has no email on file' }

  const firstName = candidate.firstName || 'there'
  const frontendUrl = (process.env.NEXT_PUBLIC_FRONTEND_URL || process.env.APP_URL || '').replace(/\/$/, '')

  let bodyHtml: string
  let bodyText: string
  let actionUrl: string | undefined
  let actionText: string | undefined

  if (!hasOffer) {
    const responseToken = signOnboardingResponseToken(onboardingId, candidate.id)
    actionUrl = frontendUrl ? `${frontendUrl}/onboarding/respond?token=${encodeURIComponent(responseToken)}` : undefined
    actionText = 'Start onboarding'
    bodyHtml = `<p>Hi ${firstName},</p><p>Welcome! Before we can send your offer at ${companyName}, please complete a few quick onboarding steps: review the company handbook and confirm you are ready for the role.</p>`
    bodyText = `Hi ${firstName},\n\nWelcome! Before we can send your offer at ${companyName}, please complete a few quick onboarding steps: review the company handbook and confirm you are ready for the role.`
  } else {
    actionUrl = frontendUrl ? `${frontendUrl}/login` : undefined
    actionText = 'Open the staff portal'
    bodyHtml = `<p>Hi ${firstName},</p><p>Welcome to ${companyName}! To complete your onboarding, please log in to the staff portal and upload your required documents: means of identification, guarantor form, and your signed offer letter.</p>`
    bodyText = `Hi ${firstName},\n\nWelcome to ${companyName}! To complete your onboarding, please log in to the staff portal and upload your required documents: means of identification, guarantor form, and your signed offer letter.`
  }

  const subject = `Welcome to ${companyName}: Complete your onboarding`
  const html = renderSystemEmailHtml({ companyName, subject, bodyHtml, actionUrl, actionText })
  const text = renderSystemEmailText({ companyName, bodyText, actionUrl })

  const result = await sendEmail({ to, subject, html, text })

  try {
    await prisma.emailLog.create({
      data: {
        companyId,
        emailType: 'ONBOARDING_WELCOME',
        recipient: to,
        status: result.success ? 'SENT' : 'FAILED',
        sentBy,
        error: result.success ? null : (result.error || 'Failed to send'),
        metadata: { onboardingId, candidateId: candidate.id },
      },
    })
  } catch (logErr) { console.error('Failed to log welcome email (non-critical):', logErr) }

  return result
}
