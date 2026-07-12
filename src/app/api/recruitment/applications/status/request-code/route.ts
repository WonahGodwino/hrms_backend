// POST /api/recruitment/applications/status/request-code  (PUBLIC)
// Step 1 of the applicant self-service status check: emails a one-time
// verification code to the address IF it has applications on file. The response
// is identical whether or not the email exists (prevents email enumeration).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { sendEmail } from '@/app/lib/email'
import rateLimit from '@/app/lib/rateLimiter'
import { issueCode } from '@/app/lib/recruitment/statusOtp'

// Module-scoped limiters persist across requests.
const ipLimiter = rateLimit({ interval: 60 * 1000, uniqueTokenPerInterval: 5000 })
const emailLimiter = rateLimit({ interval: 15 * 60 * 1000, uniqueTokenPerInterval: 20000 })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const clientIp = (request: NextRequest) =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  request.headers.get('x-real-ip') ||
  'unknown'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const body = await request.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()

    if (!EMAIL_RE.test(email) || email.length > 254) {
      return withCors(ApiResponse.error('A valid email address is required', 400), origin)
    }

    // Identical success response regardless of whether the email has applications.
    const generic = () =>
      withCors(
        ApiResponse.success(
          { sent: true },
          'If applications exist for this email, a verification code has been sent.',
        ),
        origin,
      )

    // Throttle per IP (abuse) and per email (spam / email bombing).
    try {
      await ipLimiter.check(10, `status-code:ip:${clientIp(request)}`)
    } catch {
      return withCors(ApiResponse.error('Too many requests. Please try again in a minute.', 429), origin)
    }
    try {
      await emailLimiter.check(3, `status-code:email:${email}`)
    } catch {
      // Silently generic so an attacker can't tell a real email is being throttled.
      return generic()
    }

    // Only issue + email a code when the address actually has applications, so we
    // never send codes to non-applicants — but never reveal this in the response.
    const count = await prisma.jobApplication.count({ where: { candidate: { email } } })
    if (count > 0) {
      const code = issueCode(email)
      await sendEmail({
        to: email,
        subject: 'Your application status verification code',
        html:
          `<p>Use this code to view the status of your application(s):</p>` +
          `<p style="font-size:24px;font-weight:800;letter-spacing:4px;margin:12px 0">${code}</p>` +
          `<p>This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>`,
        text: `Your application status verification code is ${code}. It expires in 10 minutes. If you didn't request it, ignore this email.`,
      }).catch((e: any) => console.error('Status code email failed:', e?.message))
    }

    return generic()
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
