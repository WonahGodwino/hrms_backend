// POST /api/recruitment/offers/batch-dispatch
// Dispatches the offer letter for many offers at once (multi-select on the
// "Pending Dispatch" tab). Partial-success: each offer is attempted independently
// and a per-offer result is returned. Skips offers that are already dispatched
// or in a terminal state.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { dispatchOfferLetter } from '@/app/lib/offers/dispatch'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

// Only APPROVED offers may be dispatched — everything else must clear approval first.
const DISPATCHABLE = ['APPROVED']

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    const body = await request.json().catch(() => ({}))
    const offerIds: string[] = Array.isArray(body.offerIds) ? body.offerIds.map(String).filter(Boolean) : []
    if (offerIds.length === 0) return withCors(ApiResponse.error('Select at least one offer to dispatch', 400), origin)
    // Optional shared template for the whole batch (user picks it at dispatch time).
    const templateId: string | null = body.templateId ? String(body.templateId) : null

    // The letter template + email footer need these company settings; fail fast
    // with one clear message rather than a failure per offer.
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { hrRepName: true, hrRepTitle: true, communicationTool: true },
    })
    if (!company) return withCors(ApiResponse.error('Company not found', 404), origin)
    const missing: string[] = []
    if (!company.hrRepName) missing.push('HR Representative')
    if (!company.hrRepTitle) missing.push('HR Representative Title')
    if (!company.communicationTool) missing.push('Communication Tool')
    if (missing.length) {
      return withCors(ApiResponse.error(
        `Configure these company settings before dispatching: ${missing.join(', ')}. Go to Offer Letter Settings.`, 400,
      ), origin)
    }

    // Load the targeted offers (company-scoped) so we can skip ineligible ones.
    const offers = await prisma.offer.findMany({
      where: { id: { in: offerIds }, companyId, archived: 0 },
      select: { id: true, status: true },
    })
    const byId = new Map(offers.map((o) => [o.id, o]))

    const results: any[] = []
    for (const offerId of offerIds) {
      const offer = byId.get(offerId)
      if (!offer) { results.push({ offerId, success: false, error: 'Offer not found' }); continue }
      if (!DISPATCHABLE.includes(offer.status)) {
        const reason = ['DRAFT', 'PENDING_APPROVAL', 'REJECTED'].includes(offer.status)
          ? 'Not approved yet'
          : `Already ${offer.status.toLowerCase()}`
        results.push({ offerId, success: false, error: reason }); continue
      }
      try {
        const r = await dispatchOfferLetter(offerId, {
          companyId, role: user.role, userId: user.userId, templateId,
        })
        results.push(r)
      } catch (err: any) {
        results.push({ offerId, success: false, error: err?.message || 'Dispatch failed' })
      }
    }

    const dispatched = results.filter((r) => r.success).length
    const failed = results.length - dispatched
    const message = failed === 0
      ? `${dispatched} offer letter(s) dispatched.`
      : `${dispatched} dispatched, ${failed} skipped/failed.`

    return withCors(ApiResponse.success({ dispatched, failed, results }, message), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
