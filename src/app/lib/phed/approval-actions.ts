// Shared transition logic for the Module 12 action endpoints (recommend,
// approve, finalapprove, flag). Each route only differs in which
// PhedAccessRole(s) may call it — the actual sequencing/stamping logic here
// is identical, so it lives in one place.

import { prisma } from '@/app/lib/db'
import { PhedApprovalMemo } from '@prisma/client'
import { getStageDef, getStageForRole, FINAL_STAGE } from '@/app/lib/phed/approval-stages'
import { notifyAfterForward, notifyAfterFlag } from '@/app/lib/phed/approval-notifications'
import type { PhedAuthUser } from '@/app/lib/phed/access-role'

export type ApprovalActionResult =
  | { ok: true; memo: PhedApprovalMemo }
  | { ok: false; status: number; message: string }

async function loadMemoForCompany(
  memoId: string,
  user: { role: string; companyId?: string },
): Promise<PhedApprovalMemo | null> {
  const memo = await prisma.phedApprovalMemo.findUnique({ where: { id: memoId } })
  if (!memo) return null
  if (user.role !== 'SUPER_ADMIN' && memo.companyId !== user.companyId) return null
  return memo
}

async function actorName(staffRecordId: string): Promise<string> {
  const staff = await prisma.staffRecord.findUnique({
    where: { id: staffRecordId },
    select: { firstName: true, lastName: true },
  })
  return staff ? `${staff.firstName} ${staff.lastName}` : 'Unknown'
}

// Server-side sequencing rule (PRD 12.7, non-negotiable): the caller's own
// PHED role must own the memo's CURRENT stage, not just be allowed to call
// this endpoint in general. Mismatch -> 409, never 403 — the role is valid,
// the timing isn't.
function checkAtOwnDesk(memo: PhedApprovalMemo, user: PhedAuthUser): ApprovalActionResult | null {
  if (memo.status === 'APPROVED') {
    return { ok: false, status: 409, message: 'This memo has already been fully approved' }
  }
  const myStage = getStageForRole(user.phedAccessRole)!
  if (memo.currentStage !== myStage.stage) {
    return {
      ok: false,
      status: 409,
      message: `This memo is not at your desk. It is currently at Stage ${memo.currentStage} (${getStageDef(memo.currentStage)?.label}).`,
    }
  }
  return null
}

// Forward action shared by recommend / approve / finalapprove.
export async function forwardApprovalStage(
  memoId: string,
  user: PhedAuthUser,
  comment?: string,
): Promise<ApprovalActionResult> {
  const memo = await loadMemoForCompany(memoId, user)
  if (!memo) return { ok: false, status: 404, message: 'Approval memo not found' }

  const deskCheck = checkAtOwnDesk(memo, user)
  if (deskCheck) return deskCheck

  const myStage = getStageForRole(user.phedAccessRole)!
  const isFinal = myStage.stage === FINAL_STAGE
  const name = await actorName(user.userId)

  const updated = await prisma.$transaction(async tx => {
    await tx.phedApprovalStamp.create({
      data: {
        memoId: memo.id,
        attemptNumber: memo.attemptNumber,
        stage: myStage.stage,
        action: myStage.action,
        staffRecordId: user.userId,
        actorName: name,
        actorRole: myStage.role,
        comment: comment || null,
      },
    })
    // The memo reaching "Approved" does NOT approve the pay period — the two
    // are independent records (FE guide §6.3). Stage 5 signing off only
    // finalises the memo; an HR/Admin user still takes the quick-route action
    // on the period itself to move it into APPROVED and unlock payslips.
    const updatedMemo = await tx.phedApprovalMemo.update({
      where: { id: memo.id },
      data: {
        currentStage: isFinal ? myStage.stage : myStage.stage + 1,
        status: myStage.resultStatus,
        stageEnteredAt: new Date(),
      },
    })

    return updatedMemo
  })

  notifyAfterForward(updated, name).catch(err => console.error('PHED approval notification failed:', err))

  return { ok: true, memo: updated }
}

// Flag action — always returns the memo to Stage 1, bumping attemptNumber so
// the prior cycle's stamps are preserved but marked superseded (Task 5's
// detail route derives `superseded` from attemptNumber).
export async function flagApprovalMemo(
  memoId: string,
  user: PhedAuthUser,
  comment: string,
): Promise<ApprovalActionResult> {
  const memo = await loadMemoForCompany(memoId, user)
  if (!memo) return { ok: false, status: 404, message: 'Approval memo not found' }

  const deskCheck = checkAtOwnDesk(memo, user)
  if (deskCheck) return deskCheck

  const myStage = getStageForRole(user.phedAccessRole)!
  const name = await actorName(user.userId)

  const updated = await prisma.$transaction(async tx => {
    await tx.phedApprovalStamp.create({
      data: {
        memoId: memo.id,
        attemptNumber: memo.attemptNumber,
        stage: myStage.stage,
        action: 'FLAGGED',
        staffRecordId: user.userId,
        actorName: name,
        actorRole: myStage.role,
        comment,
      },
    })
    return tx.phedApprovalMemo.update({
      where: { id: memo.id },
      data: {
        currentStage: 1,
        status: 'RETURNED_FOR_CORRECTION',
        attemptNumber: memo.attemptNumber + 1,
        stageEnteredAt: new Date(),
      },
    })
  })

  notifyAfterFlag(updated, name, comment).catch(err => console.error('PHED approval notification failed:', err))

  return { ok: true, memo: updated }
}
