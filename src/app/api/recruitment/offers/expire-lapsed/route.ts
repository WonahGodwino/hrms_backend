// POST /api/recruitment/offers/expire-lapsed
// Sweeps offers whose candidate response window has lapsed and marks them EXPIRED
// (and the related application REJECTED) so HR/ADMIN can re-offer another candidate.
//
// Two ways to authenticate:
//  1. A nightly cron job: send header `x-cron-secret: <process.env.CRON_SECRET>`.
//     Sweeps every company. (Only works if CRON_SECRET is configured.)
//  2. An authenticated HR/ADMIN/SUPER_ADMIN user: sweeps their own company only
//     (SUPER_ADMIN may pass ?companyId=… or omit to sweep all companies).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getResponseDeadline, isResponseExpired } from '@/app/lib/offers/response-window'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// Offers that are "out with the candidate" and could still lapse.
const PENDING_STATUSES = ['SENT', 'APPROVED', 'AWAITING_SIGNATURE'] as const

export async function POST(req: NextRequest, ) {
  const origin = req.headers.get('origin')
  try {
    // ---- Authentication: cron secret OR authenticated HR/ADMIN ----
    const cronSecret = process.env.CRON_SECRET
    const providedSecret = req.headers.get('x-cron-secret')
    const isCron = !!cronSecret && providedSecret === cronSecret

    let scopeCompanyId: string | null = null
    if (!isCron) {
      const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
      const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
      const requested = new URL(req.url).searchParams.get('companyId')
      if (user.role === 'SUPER_ADMIN') {
        // SUPER_ADMIN may target one company or sweep all (no scope).
        scopeCompanyId = requested || null
      } else {
        scopeCompanyId = requested || user.companyId || null
        if (!scopeCompanyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)
      }
    }

    // ---- Find candidate-pending offers with no signed letter on file ----
    const candidates = await prisma.offer.findMany({
      where: {
        status: { in: PENDING_STATUSES as any },
        executedPdfPath: null,
        ...(scopeCompanyId ? { companyId: scopeCompanyId } : {}),
      },
      select: {
        id: true, status: true, sentAt: true, metadata: true,
        executedPdfPath: true, applicationId: true, companyId: true,
      },
    })

    const expired: { offerId: string; applicationId: string | null; deadline: string | null }[] = []

    for (const offer of candidates) {
      const deadline = getResponseDeadline(offer)
      if (!isResponseExpired(offer, deadline)) continue

      // Mark the offer EXPIRED and stamp when/why.
      await prisma.offer.update({
        where: { id: offer.id },
        data: {
          status: 'EXPIRED',
          metadata: {
            ...((offer.metadata && typeof offer.metadata === 'object') ? offer.metadata as any : {}),
            expiredAt: new Date().toISOString(),
            expiredReason: 'Candidate response window lapsed',
          } as any,
        },
      }).catch(() => {})

      // Free up the application so HR/ADMIN can re-offer another shortlisted candidate.
      if (offer.applicationId) {
        await prisma.jobApplication.update({
          where: { id: offer.applicationId },
          data: { status: 'REJECTED' },
        }).catch(() => {})
      }

      expired.push({
        offerId: offer.id,
        applicationId: offer.applicationId,
        deadline: deadline ? deadline.toISOString() : null,
      })
    }

    return withCors(ApiResponse.success({
      scanned: candidates.length,
      expiredCount: expired.length,
      expired,
    }, expired.length
      ? `${expired.length} lapsed offer(s) marked as expired.`
      : 'No lapsed offers found.'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
