// Builds the current-state approval memo PDF buffer. Shared by the memo PDF
// endpoint and the MD/CEO email attachment so the same PDF is produced in both.

import { prisma } from '@/app/lib/db'
import { buildApprovalMemoSections } from '@/app/lib/phed/approval-memo-data'
import { getStageDef, getDisplayStatus } from '@/app/lib/phed/approval-stages'
import { generateApprovalMemoPdf } from '@/app/lib/phed/pdf-approval-memo'

export async function buildApprovalMemoPdfBuffer(
  memoId: string,
): Promise<{ data: Buffer; fileName: string } | null> {
  const memo = await prisma.phedApprovalMemo.findUnique({
    where: { id: memoId },
    include: { stamps: { orderBy: [{ stage: 'asc' }, { createdAt: 'asc' }] } },
  })
  if (!memo) return null

  const sections = await buildApprovalMemoSections(memo.payPeriodId)

  // The live signature block reflects the current attempt only.
  const currentStamps = memo.stamps
    .filter((s) => s.attemptNumber === memo.attemptNumber)
    .map((s) => ({
      stage: s.stage,
      stampLabel: getStageDef(s.stage)?.stampLabel ?? `Stage ${s.stage}`,
      actorName: s.actorName,
      comment: s.comment,
      createdAt: s.createdAt,
    }))

  const data = await generateApprovalMemoPdf({
    companyName: sections.companyName,
    periodName: sections.periodName,
    subject: sections.subject,
    date: memo.createdAt,
    displayStatus: getDisplayStatus(memo.status),
    currentStageLabel: getStageDef(memo.currentStage)?.label ?? `Stage ${memo.currentStage}`,
    approvalSentence: sections.approvalSentence,
    sectionA: sections.sectionA,
    sectionB: sections.sectionB,
    totalNetPay: sections.totalNetPay,
    stamps: currentStamps,
  })

  return {
    data,
    fileName: `approval-memo-${sections.periodName.replace(/\s+/g, '-')}.pdf`,
  }
}
