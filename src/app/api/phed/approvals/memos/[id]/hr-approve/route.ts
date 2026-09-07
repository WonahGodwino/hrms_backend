import { NextRequest } from 'next/server'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requireModuleAccess } from '@/app/lib/module-access'
import { releaseApprovalToAudit } from '@/app/lib/phed/approval-actions'
import { getStageDef } from '@/app/lib/phed/approval-stages'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// PATCH /api/phed/approvals/memos/:id/hr-approve — Stage 1: HR sign-off
// after the Tax Manager has concurred. Releases the memo to Head, Internal
// Audit (Stage 3). Performed by the HR/ADMIN/SUPER_ADMIN payroll uploader.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    const comment = typeof body?.comment === 'string' && body.comment.trim()
      ? body.comment.trim()
      : undefined
    const result = await releaseApprovalToAudit(params.id, user, comment)
    if (!result.ok) return withCors(ApiResponse.error(result.message, result.status), origin)

    return withCors(
      ApiResponse.success(result.memo, `Memo released to ${getStageDef(result.memo.currentStage)?.label}`),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
