import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/phed/pay-periods/:id/revert
// Rolls the pay period back one step in the lifecycle.
//
// Revert map (current → previous):
//   VALIDATION_OPEN   → DRAFT
//   VALIDATION_CLOSED → VALIDATION_OPEN
//   TEMPLATE_ISSUED   → VALIDATION_CLOSED
//   PROCESSING        → TEMPLATE_ISSUED
//   REVIEW            → PROCESSING
//   APPROVED          → REVIEW
//
// Blocked at DRAFT (already first step) and PAID (terminal).
// Blocked at any step if an active approval memo exists (status not RETURNED_FOR_CORRECTION).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const period = await prisma.phedPayPeriod.findUnique({ where: { id: params.id } })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && period.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Pay period not found'), origin)

    type RevertableStatus = 'VALIDATION_OPEN' | 'VALIDATION_CLOSED' | 'TEMPLATE_ISSUED' | 'PROCESSING' | 'REVIEW' | 'APPROVED'

    const REVERT_MAP: Record<RevertableStatus, { prevStatus: string; clearFields: Record<string, null> }> = {
      VALIDATION_OPEN:   { prevStatus: 'DRAFT',             clearFields: { validationOpenAt: null } },
      VALIDATION_CLOSED: { prevStatus: 'VALIDATION_OPEN',   clearFields: { validationCloseAt: null } },
      TEMPLATE_ISSUED:   { prevStatus: 'VALIDATION_CLOSED', clearFields: {} },
      PROCESSING:        { prevStatus: 'TEMPLATE_ISSUED',   clearFields: {} },
      REVIEW:            { prevStatus: 'PROCESSING',        clearFields: {} },
      APPROVED:          { prevStatus: 'REVIEW',            clearFields: { approvedBy: null, approvedAt: null } },
    }

    const current = period.status as string

    if (current === 'DRAFT') {
      return withCors(
        ApiResponse.error('Pay period is already at the first step and cannot be reverted further', 400),
        origin
      )
    }
    if (current === 'PAID') {
      return withCors(
        ApiResponse.error('A PAID pay period cannot be reverted', 400),
        origin
      )
    }
    if (!Object.keys(REVERT_MAP).includes(current)) {
      return withCors(ApiResponse.error('This pay period cannot be reverted', 400), origin)
    }

    // Block revert if an active approval memo is in flight for this period.
    // RETURNED_FOR_CORRECTION means the chain already stopped, so revert is safe.
    const activeMemo = await prisma.phedApprovalMemo.findUnique({
      where: { payPeriodId: params.id },
      select: { id: true, status: true },
    })
    if (activeMemo && activeMemo.status !== 'RETURNED_FOR_CORRECTION') {
      return withCors(
        ApiResponse.error(
          'Cannot revert: this pay period has an active approval memo in progress. Flag or complete the approval workflow first.',
          409
        ),
        origin
      )
    }

    const { prevStatus, clearFields } = REVERT_MAP[current as RevertableStatus]

    const updated = await prisma.phedPayPeriod.update({
      where: { id: params.id },
      data: { status: prevStatus as any, ...clearFields },
    })

    return withCors(
      ApiResponse.success(updated, `Pay period reverted from ${current} to ${prevStatus}`),
      origin
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
