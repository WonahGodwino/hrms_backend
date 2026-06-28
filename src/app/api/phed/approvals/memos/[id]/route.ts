import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedApprovalAccess } from '@/app/lib/phed/access-role'
import { buildApprovalMemoSections } from '@/app/lib/phed/approval-memo-data'
import { getStageDef, getDisplayStatus } from '@/app/lib/phed/approval-stages'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/approvals/memos/:id — full memo detail (Screen 2)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedApprovalAccess(token)

    const memo = await prisma.phedApprovalMemo.findUnique({
      where: { id: params.id },
      include: {
        payPeriod: { select: { id: true, periodName: true, month: true, year: true } },
        stamps: { orderBy: [{ attemptNumber: 'asc' }, { stage: 'asc' }, { createdAt: 'asc' }] },
      },
    })
    if (!memo) return withCors(ApiResponse.notFound('Approval memo not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && memo.companyId !== user.companyId) {
      return withCors(ApiResponse.notFound('Approval memo not found'), origin)
    }

    const sections = await buildApprovalMemoSections(memo.payPeriodId)
    const currentStageDef = getStageDef(memo.currentStage)

    const stamps = memo.stamps.map(s => ({ ...s, superseded: s.attemptNumber < memo.attemptNumber }))
    const iadConcurrenceStamp =
      stamps.find(s => s.stage === 2 && s.attemptNumber === memo.attemptNumber && !s.superseded) ?? null

    return withCors(
      ApiResponse.success({
        memo: {
          id: memo.id,
          companyId: memo.companyId,
          payPeriodId: memo.payPeriodId,
          currentStage: memo.currentStage,
          currentStageLabel: currentStageDef?.label ?? null,
          status: memo.status,
          displayStatus: getDisplayStatus(memo.status),
          attemptNumber: memo.attemptNumber,
          stageEnteredAt: memo.stageEnteredAt,
          date: memo.createdAt,
        },
        payPeriod: memo.payPeriod,
        sections: {
          subject: sections.subject,
          sectionA: sections.sectionA,
          sectionEarnings: sections.sectionEarnings,
          sectionB: sections.sectionB,
          totalNetPay: sections.totalNetPay,
          approvalSentence: sections.approvalSentence,
        },
        stamps,
        iadConcurrenceStamp, // CFO-specific pinned callout (PRD 12.6 item 39)
      }),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
