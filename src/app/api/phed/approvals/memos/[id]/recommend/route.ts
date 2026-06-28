import { NextRequest } from 'next/server'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedAccessRole } from '@/app/lib/phed/access-role'
import { forwardApprovalStage } from '@/app/lib/phed/approval-actions'
import { getStageDef } from '@/app/lib/phed/approval-stages'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// PATCH /api/phed/approvals/memos/:id/recommend — Stage 2: Head, Internal Audit
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedAccessRole(token, ['HEAD_INTERNAL_AUDIT'])

    const body = await req.json().catch(() => ({}))
    const result = await forwardApprovalStage(params.id, user, body?.comment)
    if (!result.ok) return withCors(ApiResponse.error(result.message, result.status), origin)

    return withCors(
      ApiResponse.success(result.memo, `Memo advanced to ${getStageDef(result.memo.currentStage)?.label}`),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
