// Fans a notification + email out to every staff member holding a given
// PhedAccessRole for a company (a "desk" can have more than one holder —
// e.g. Treasury Team). Always fire-and-forget: a notification/email failure
// must never block or fail the approval action that triggered it.

import { prisma } from '@/app/lib/db'
import { PhedAccessRole, PhedApprovalMemo } from '@prisma/client'
import { createNotification, NOTIFICATION_TYPES } from '@/app/lib/notifications/helpers'
import { sendPhedApprovalNotificationEmail } from '@/app/lib/phed/email'
import { getStageDef, FINAL_STAGE } from '@/app/lib/phed/approval-stages'

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://247hr.co.uk'

async function notifyRoleHolders(params: {
  companyId: string
  accessRole: PhedAccessRole
  memoId: string
  notificationType: string
  title: string
  message: string
  emailHeading: string
  emailBody: string
}) {
  const [recipients, memo, company] = await Promise.all([
    prisma.phedStaffAccessRole.findMany({
      where: { companyId: params.companyId, accessRole: params.accessRole },
      include: { staffRecord: { select: { id: true, email: true, firstName: true, lastName: true } } },
    }),
    prisma.phedApprovalMemo.findUnique({
      where: { id: params.memoId },
      select: { payPeriod: { select: { periodName: true } } },
    }),
    prisma.company.findUnique({ where: { id: params.companyId }, select: { companyName: true } }),
  ])

  const companyName = company?.companyName ?? ''
  const periodName = memo?.payPeriod.periodName ?? ''
  const deepLink = `${FRONTEND_URL}/phed/approvals/memos/${params.memoId}`

  await Promise.all(
    recipients.map(async ({ staffRecord: staff }) => {
      await createNotification(
        staff.id,
        params.notificationType,
        params.title,
        params.message,
        { memoId: params.memoId, deepLink },
        params.companyId,
      ).catch(err => console.error('PHED approval notification failed:', err))

      await sendPhedApprovalNotificationEmail({
        to: staff.email,
        recipientName: `${staff.firstName} ${staff.lastName}`,
        companyName,
        periodName,
        subjectLine: params.title,
        heading: params.emailHeading,
        bodyText: params.emailBody,
        deepLink,
      }).catch(err => console.error('PHED approval email failed:', err))
    }),
  )
}

// Called after a forward action (recommend/approve/finalapprove) commits.
export async function notifyAfterForward(memo: PhedApprovalMemo, fromActorName: string): Promise<void> {
  if (memo.status === 'APPROVED') {
    await notifyRoleHolders({
      companyId: memo.companyId,
      accessRole: 'TREASURY_TEAM',
      memoId: memo.id,
      notificationType: NOTIFICATION_TYPES.PHED_APPROVAL_FINAL,
      title: 'Approval memo finalised — period approval still required',
      message: `The payroll approval memo received final approval from the MD/CEO. The Bank Schedule is now available to Treasury; an HR/Admin user must still approve the pay period itself to unlock payslips.`,
      emailHeading: 'Approval memo finalised — period approval pending',
      emailBody: `The Payroll Approval Memo has completed the full five-stage review and received final approval. The Bank Schedule is now available to Treasury. An HR/Admin user must still approve the pay period itself to unlock payslip emails and move it to Paid.`,
    })
    return
  }

  const nextStage = getStageDef(memo.currentStage)
  if (!nextStage) return

  await notifyRoleHolders({
    companyId: memo.companyId,
    accessRole: nextStage.role,
    memoId: memo.id,
    notificationType: NOTIFICATION_TYPES.PHED_APPROVAL_ACTION_NEEDED,
    title: 'A payroll approval memo awaits your review',
    message: `${fromActorName} forwarded a payroll approval memo to your desk.`,
    emailHeading: 'A payroll approval memo is awaiting your review',
    emailBody: `${fromActorName} has forwarded this Payroll Approval Memo to your desk (${nextStage.label}). Please review and take action.`,
  })
}

// Called after a flag action commits — always returns to Stage 1.
export async function notifyAfterFlag(memo: PhedApprovalMemo, flaggedByActorName: string, comment: string): Promise<void> {
  const stage1 = getStageDef(1)
  if (!stage1) return

  await notifyRoleHolders({
    companyId: memo.companyId,
    accessRole: stage1.role,
    memoId: memo.id,
    notificationType: NOTIFICATION_TYPES.PHED_APPROVAL_FLAGGED,
    title: 'Payroll approval memo flagged back for correction',
    message: `${flaggedByActorName} flagged the payroll approval memo back to your desk: "${comment}"`,
    emailHeading: 'A payroll approval memo was flagged back for correction',
    emailBody: `${flaggedByActorName} flagged this Payroll Approval Memo back for correction. Their comment: "${comment}". Please correct the figures and resubmit.`,
  })
}
