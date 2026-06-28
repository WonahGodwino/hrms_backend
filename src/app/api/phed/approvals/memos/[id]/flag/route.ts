import { NextRequest } from 'next/server'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedAccessRole } from '@/app/lib/phed/access-role'
import { flagApprovalMemo } from '@/app/lib/phed/approval-actions'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// PATCH /api/phed/approvals/memos/:id/flag — Stages 2-5 -> back to Stage 1
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedAccessRole(token, [
      'HEAD_INTERNAL_AUDIT', 'CHIEF_PEOPLE_OFFICER', 'CHIEF_FINANCE_OFFICER', 'MD_CEO',
    ])

    const body = await req.json().catch(() => ({}))
    const comment = typeof body?.comment === 'string' ? body.comment.trim() : ''
    if (!comment) {
      return withCors(ApiResponse.error('A comment is required when flagging a memo back for correction', 400), origin)
    }

    const result = await flagApprovalMemo(params.id, user, comment)
    if (!result.ok) return withCors(ApiResponse.error(result.message, result.status), origin)

    return withCors(
      ApiResponse.success(result.memo, 'Memo flagged and returned to Manager, Compensation & Benefits'),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
