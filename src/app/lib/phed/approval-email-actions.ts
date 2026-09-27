// Applies an MD/CEO decision that arrived via email (no login). Mirrors the
// two in-system terminal actions:
//   approve → FINAL_APPROVED stamp + memo → APPROVED  (pay period freezes)
//   reject  → FLAGGED stamp + memo → RETURNED_FOR_CORRECTION (back to Stage 1)

import { prisma } from '@/app/lib/db'
import { PhedApprovalMemo } from '@prisma/client'
import { FINAL_STAGE } from '@/app/lib/phed/approval-stages'
import { notifyAfterForward, notifyAfterFlag } from '@/app/lib/phed/approval-notifications'
import type { EmailActionDecision } from '@/app/lib/phed/email-action-token'

export type EmailActionResult =
  | { ok: true; memo: PhedApprovalMemo; decision: EmailActionDecision }
  | { ok: false; status: number; message: string }

async function resolveActor(companyId: string): Promise<{ staffRecordId: string; name: string }> {
  const holder = await prisma.phedStaffAccessRole.findFirst({
    where: { companyId, accessRole: 'MD_CEO' },
    include: { staffRecord: { select: { id: true, firstName: true, lastName: true } } },
  })
  if (holder?.staffRecord) {
    const name = `${holder.staffRecord.firstName} ${holder.staffRecord.lastName}`.trim()
    return { staffRecordId: holder.staffRecord.id, name: name || 'MD/CEO' }
  }
  return { staffRecordId: 'email-action', name: 'MD/CEO (via email)' }
}

export async function applyEmailDecision(
  memoId: string,
  decision: EmailActionDecision,
  comment?: string,
): Promise<EmailActionResult> {
  const memo = await prisma.phedApprovalMemo.findUnique({ where: { id: memoId } })
  if (!memo) return { ok: false, status: 404, message: 'Approval memo not found' }

  if (memo.status !== 'PENDING_FINAL_APPROVAL' || memo.currentStage !== FINAL_STAGE) {
    return {
      ok: false,
      status: 409,
      message: 'This memo is no longer awaiting the MD/CEO final decision.',
    }
  }

  const actor = await resolveActor(memo.companyId)

  const updated = await prisma.$transaction(async (tx) => {
    if (decision === 'approve') {
      await tx.phedApprovalStamp.create({
        data: {
          memoId,
          attemptNumber: memo.attemptNumber,
          stage: FINAL_STAGE,
          action: 'FINAL_APPROVED',
          staffRecordId: actor.staffRecordId,
          actorName: actor.name,
          actorRole: 'MD_CEO',
          comment: comment || null,
        },
      })
      return tx.phedApprovalMemo.update({
        where: { id: memoId },
        data: { currentStage: FINAL_STAGE, status: 'APPROVED', stageEnteredAt: new Date() },
      })
    }

    await tx.phedApprovalStamp.create({
      data: {
        memoId,
        attemptNumber: memo.attemptNumber,
        stage: FINAL_STAGE,
        action: 'FLAGGED',
        staffRecordId: actor.staffRecordId,
        actorName: actor.name,
        actorRole: 'MD_CEO',
        comment: comment || 'Rejected via email',
      },
    })
    return tx.phedApprovalMemo.update({
      where: { id: memoId },
      data: {
        currentStage: 1,
        status: 'RETURNED_FOR_CORRECTION',
        attemptNumber: memo.attemptNumber + 1,
        stageEnteredAt: new Date(),
      },
    })
  })

  if (decision === 'approve') {
    notifyAfterForward(updated, actor.name).catch((err) =>
      console.error('[PHED EMAIL ACTION] final-approval notify failed:', err),
    )
  } else {
    notifyAfterFlag(updated, actor.name, comment || 'Rejected via email').catch((err) =>
      console.error('[PHED EMAIL ACTION] reject notify failed:', err),
    )
  }

  return { ok: true, memo: updated, decision }
}
