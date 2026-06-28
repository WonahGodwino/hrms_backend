import { NextRequest } from 'next/server'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedAccessRole } from '@/app/lib/phed/access-role'
import { forwardApprovalStage } from '@/app/lib/phed/approval-actions'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// PATCH /api/phed/approvals/memos/:id/finalapprove — Stage 5: MD/CEO
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedAccessRole(token, ['MD_CEO'])

    const body = await req.json().catch(() => ({}))
    const result = await forwardApprovalStage(params.id, user, body?.comment)
    if (!result.ok) return withCors(ApiResponse.error(result.message, result.status), origin)

    return withCors(
      ApiResponse.success(result.memo, 'Final approval recorded. Memo is now APPROVED — Ready for Disbursement.'),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
