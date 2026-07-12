// POST /api/recruitment/applications/status/verify  (PUBLIC)
// Step 2: verifies the emailed code and, on success, returns only NON-SENSITIVE
// status info for the applications tied to that email (no scores, reviewer notes,
// AI analysis, rejection reasons, or interviewer details are ever exposed).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import rateLimit from '@/app/lib/rateLimiter'
import { verifyCode } from '@/app/lib/recruitment/statusOtp'

const ipLimiter = rateLimit({ interval: 60 * 1000, uniqueTokenPerInterval: 5000 })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Candidate-facing labels — deliberately generic (e.g. no rejection reasons).
const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Application received',
  REVIEWING: 'Under review',
  SHORTLISTED: 'Shortlisted',
  INTERVIEWING: 'Interview stage',
  OFFERED: 'Offer stage',
  HIRED: 'Hired',
  REJECTED: 'Not selected',
  WITHDRAWN: 'Withdrawn',
}

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
    const code = String(body.code || '').trim()

    if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) {
      return withCors(ApiResponse.error('A valid email and 6-digit code are required', 400), origin)
    }

    // Throttle verification attempts per IP (brute force).
    try {
      await ipLimiter.check(20, `status-verify:ip:${clientIp(request)}`)
    } catch {
      return withCors(ApiResponse.error('Too many attempts. Please try again in a minute.', 429), origin)
    }

    const result = verifyCode(email, code)
    if (result !== 'ok') {
      const message =
        result === 'expired'
          ? 'This code has expired. Please request a new one.'
          : result === 'locked'
            ? 'Too many attempts for this code. Please request a new one.'
            : 'Invalid or expired code.'
      return withCors(ApiResponse.error(message, 400), origin)
    }

    // Verified — return only safe fields.
    const apps = await prisma.jobApplication.findMany({
      where: { candidate: { email }, archived: 0 },
      select: {
        status: true,
        createdAt: true,
        updatedAt: true,
        job: {
          select: {
            title: true,
            department: true,
            company: { select: { companyName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const applications = apps.map((a) => ({
      jobTitle: a.job?.title || 'Role',
      department: a.job?.department || '',
      company: a.job?.company?.companyName || '',
      status: STATUS_LABEL[a.status] || 'In progress',
      appliedOn: a.createdAt.toISOString(),
      lastUpdate: a.updatedAt.toISOString(),
    }))

    const res = withCors(
      ApiResponse.success({ applications }, 'Verified.'),
      origin,
    )
    // Personal data — never cache.
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
