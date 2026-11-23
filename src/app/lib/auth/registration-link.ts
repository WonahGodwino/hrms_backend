// Re-sends staff setup links (SEC-002). Used by people whose old setup link
// has no invite token or has expired. The link only ever goes to the e-mail
// address on the staff record, so asking for it proves nothing and reveals
// nothing: the endpoint answers the same way whether or not a match exists.
import { prisma } from '@/app/lib/db'
import { sendEmail } from '@/app/lib/mailgun'
import { buildRegistrationUrl, REGISTRATION_TOKEN_TTL } from '@/app/lib/auth/registration-token'

const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://247hr.co.uk'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/** E-mails a fresh setup link for every active, unregistered account with this address. Returns how many were sent. */
export async function sendRegistrationLinks(rawEmail: string): Promise<number> {
  const email = rawEmail.toLowerCase().trim()
  const accounts = await prisma.staffRecord.findMany({
    where: { email, isActive: true, isRegistered: false },
    select: { id: true, email: true, staffId: true, companyId: true, company: { select: { companyName: true } } },
  })

  let sent = 0
  for (const staff of accounts) {
    if (!staff.companyId) continue
    const url = buildRegistrationUrl(FRONTEND_URL, { id: staff.id, email: staff.email, staffId: staff.staffId, companyId: staff.companyId })
    const companyName = escapeHtml(staff.company?.companyName || 'your company')
    try {
      await sendEmail({
        to: staff.email,
        subject: `Set up your ${staff.company?.companyName || '247HR'} account`,
        html: `<p>Use the link below to set your password and finish setting up your account at <strong>${companyName}</strong>.</p>
<p><a href="${url}">Set up your account</a></p>
<p>The link works once and expires in ${REGISTRATION_TOKEN_TTL.replace('d', ' days')}. If you did not ask for it, you can ignore this e-mail.</p>`,
        text: `Set up your account at ${staff.company?.companyName || 'your company'}: ${url}\nThe link works once and expires in ${REGISTRATION_TOKEN_TTL.replace('d', ' days')}.`,
      })
      sent++
    } catch (e) {
      console.error('[registration-link] failed to send setup link:', e)
    }
  }
  return sent
}
