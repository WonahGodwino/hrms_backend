import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedApprovalAccess } from '@/app/lib/phed/access-role'
import { buildApprovalMemoSections } from '@/app/lib/phed/approval-memo-data'
import { getStageDef, getDisplayStatus } from '@/app/lib/phed/approval-stages'
import { generateApprovalMemoPdf } from '@/app/lib/phed/pdf-approval-memo'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/approvals/memos/:id/pdf — current-state Approval Memo PDF
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedApprovalAccess(token)

    const memo = await prisma.phedApprovalMemo.findUnique({
      where: { id: params.id },
      include: {
        stamps: { orderBy: [{ stage: 'asc' }, { createdAt: 'asc' }] },
      },
    })
    if (!memo) return withCors(ApiResponse.notFound('Approval memo not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && memo.companyId !== user.companyId) {
      return withCors(ApiResponse.notFound('Approval memo not found'), origin)
    }
    if (user.phedAccessRole === 'HEAD_INTERNAL_AUDIT' && !['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return withCors(ApiResponse.error('The approval memo PDF is not available for the Head, Internal Audit role. Review the Internal Audit report instead.', 403), origin)
    }

    const sections = await buildApprovalMemoSections(memo.payPeriodId)

    // PDF reflects the current attempt's progress only — a flagged-out
    // attempt's stamps are history, not part of the live signature block.
    const currentStamps = memo.stamps
      .filter(s => s.attemptNumber === memo.attemptNumber)
      .map(s => ({
        stage: s.stage,
        stampLabel: getStageDef(s.stage)?.stampLabel ?? `Stage ${s.stage}`,
        actorName: s.actorName,
        comment: s.comment,
        createdAt: s.createdAt,
      }))

    const pdf = await generateApprovalMemoPdf({
      companyName: sections.companyName,
      periodName: sections.periodName,
      subject: sections.subject,
      date: memo.createdAt,
      displayStatus: getDisplayStatus(memo.status),
      currentStageLabel: getStageDef(memo.currentStage)?.label ?? `Stage ${memo.currentStage}`,
      approvalSentence: sections.approvalSentence,
      sectionA: sections.sectionA,
      sectionEarnings: sections.sectionEarnings,
      sectionB: sections.sectionB,
      totalNetPay: sections.totalNetPay,
      stamps: currentStamps,
    })

    const fileName = `approval-memo-${sections.periodName.replace(/\s+/g, '-')}.pdf`

    return new NextResponse(pdf as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(pdf.length),
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) { return withCors(handleApiError(e), origin) }
}
