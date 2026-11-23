import { NextRequest } from 'next/server'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedAccessRole } from '@/app/lib/phed/access-role'
import { forwardApprovalStage } from '@/app/lib/phed/approval-actions'
import { getStageDef } from '@/app/lib/phed/approval-stages'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// PATCH /api/phed/approvals/memos/:id/tax-audit — Stage 2: Tax Manager
// "I concur to this" returns the memo to the HR uploader (Stage 1) for
// sign-off; HR then releases it to Head, Internal Audit (Stage 3).
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedAccessRole(token, ['TAX_AUDIT'])

    const body = await req.json().catch(() => ({}))
    const comment = typeof body?.comment === 'string' && body.comment.trim()
      ? body.comment.trim()
      : 'I concur to this'
    const result = await forwardApprovalStage(params.id, user, comment)
    if (!result.ok) return withCors(ApiResponse.error(result.message, result.status), origin)

    return withCors(
      ApiResponse.success(
        result.memo,
        `Concurrence recorded. Memo returned to ${getStageDef(result.memo.currentStage)?.label} for sign-off.`,
      ),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
