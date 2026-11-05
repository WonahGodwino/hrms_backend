// src/app/api/staff-loans-benefits/guarantor/[loanRequestId]/respond/route.ts
// POST — in-app accept/decline, for a guarantor who's already signed in.
// Calls the exact same resolveGuarantorDecision() as the public token route
// (guarantor/respond), so both channels write to identical state.
import { NextRequest } from 'next/server'
import { requireModuleAccess, ALL_ROLES } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveGuarantorDecision } from '@/app/lib/staff-loans-benefits/guarantor'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest, { params }: { params: { loanRequestId: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ALL_ROLES)

    const body = await request.json()
    const decision = String(body?.decision || '').toUpperCase().trim()
    const declineReason = String(body?.declineReason || '').trim()

    if (!['ACCEPTED', 'DECLINED'].includes(decision)) {
      return withCors(ApiResponse.error('decision must be ACCEPTED or DECLINED', 400), origin)
    }
    if (decision === 'DECLINED' && !declineReason) {
      return withCors(ApiResponse.error('Please provide a reason for declining', 400), origin)
    }

    const updated = await resolveGuarantorDecision({
      loanRequestId: params.loanRequestId,
      guarantorStaffId: user.userId,
      decision: decision as 'ACCEPTED' | 'DECLINED',
      declineReason: decision === 'DECLINED' ? declineReason : undefined,
    })

    return withCors(ApiResponse.success(updated, `Guarantor request ${decision.toLowerCase()}`), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
