import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedAccessRole, PHED_APPROVAL_CHAIN_ROLES } from '@/app/lib/phed/access-role'
import { buildApprovalMemoSections } from '@/app/lib/phed/approval-memo-data'
import { getStageForRole, getStageDef } from '@/app/lib/phed/approval-stages'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/approvals/my-queue — Screen 1 (My Approval Queue)
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedAccessRole(token, PHED_APPROVAL_CHAIN_ROLES)

    const p = new URL(req.url).searchParams
    const companyId = user.role === 'SUPER_ADMIN' ? (p.get('companyId') || user.companyId) : user.companyId
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)

    const myStage = getStageForRole(user.phedAccessRole)!

    const memoAtMyDeskRow = await prisma.phedApprovalMemo.findFirst({
      where: { companyId, currentStage: myStage.stage, status: { not: 'APPROVED' } },
      orderBy: { stageEnteredAt: 'asc' },
      include: { payPeriod: { select: { id: true, periodName: true, month: true, year: true } } },
    })

    if (memoAtMyDeskRow) {
      const sections = await buildApprovalMemoSections(memoAtMyDeskRow.payPeriodId)
      return withCors(
        ApiResponse.success({
          memoAtMyDesk: {
            id: memoAtMyDeskRow.id,
            payPeriod: memoAtMyDeskRow.payPeriod,
            totalNetPay: sections.totalNetPay,
            stageEnteredAt: memoAtMyDeskRow.stageEnteredAt,
            timeElapsedSeconds: Math.floor((Date.now() - memoAtMyDeskRow.stageEnteredAt.getTime()) / 1000),
            status: memoAtMyDeskRow.status,
          },
          activeMemoElsewhere: null,
        }),
        origin,
      )
    }

    // Not my turn — situational-awareness strip: where is the active memo, if any.
    const otherActiveMemo = await prisma.phedApprovalMemo.findFirst({
      where: { companyId, status: { not: 'APPROVED' } },
      orderBy: { stageEnteredAt: 'asc' },
      include: { payPeriod: { select: { id: true, periodName: true, month: true, year: true } } },
    })

    return withCors(
      ApiResponse.success({
        memoAtMyDesk: null,
        activeMemoElsewhere: otherActiveMemo
          ? {
              id: otherActiveMemo.id,
              payPeriod: otherActiveMemo.payPeriod,
              currentStage: otherActiveMemo.currentStage,
              currentStageLabel: getStageDef(otherActiveMemo.currentStage)?.label ?? null,
            }
          : null,
      }),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
