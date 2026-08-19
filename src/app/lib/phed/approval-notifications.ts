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
  tone?: 'info' | 'warning'
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

  console.log(
    `[PHED NOTIFY] role=${params.accessRole} memo=${params.memoId} period="${periodName}" holders=${recipients.length}`,
  )
  if (recipients.length === 0) {
    console.warn(`[PHED NOTIFY] No holders found for role ${params.accessRole} in company ${params.companyId} — nobody will be notified.`)
  }

  await Promise.all(
    recipients.map(async ({ staffRecord: staff }) => {
      const name = `${staff.firstName} ${staff.lastName}`.trim() || staff.email || staff.id

      await createNotification(
        staff.id,
        params.notificationType,
        params.title,
        params.message,
        { memoId: params.memoId, deepLink },
        params.companyId,
      ).catch(err => console.error('[PHED NOTIFY] in-app notification failed:', err))

      if (!staff.email) {
        console.warn(`[PHED NOTIFY] Skipping email for ${name} — no email address on record.`)
        return
      }

      console.log(`[PHED NOTIFY] Sending email to ${name} <${staff.email}> — "${params.emailHeading}"`)
      await sendPhedApprovalNotificationEmail({
        to: staff.email,
        recipientName: name,
        companyName,
        periodName,
        subjectLine: params.title,
        heading: params.emailHeading,
        bodyText: params.emailBody,
        deepLink,
        tone: params.tone,
      }).catch(err => console.error('[PHED NOTIFY] email send failed:', err))
    }),
  )
}

// Notify the HR/Admin who created the pay period (the memo's originator) each
// time the memo advances, is finally approved, or is flagged back. Keeps the
// creator informed even though they don't sit in the approval chain.
async function notifyCreator(params: {
  companyId: string
  payPeriodId: string
  memoId: string
  notificationType: string
  title: string
  message: string
  emailHeading: string
  emailBody: string
  tone?: 'info' | 'warning'
}) {
  const [period, company] = await Promise.all([
    prisma.phedPayPeriod.findUnique({
      where: { id: params.payPeriodId },
      select: { createdBy: true, periodName: true },
    }),
    prisma.company.findUnique({ where: { id: params.companyId }, select: { companyName: true } }),
  ])
  if (!period?.createdBy) {
    console.warn('[PHED NOTIFY] Skipping creator notification — pay period has no createdBy.')
    return
  }

  const creator = await prisma.staffRecord.findUnique({
    where: { id: period.createdBy },
    select: { id: true, email: true, firstName: true, lastName: true },
  })
  if (!creator) {
    console.warn(`[PHED NOTIFY] Skipping creator notification — creator ${period.createdBy} not found.`)
    return
  }

  const name = `${creator.firstName} ${creator.lastName}`.trim() || creator.email || creator.id
  const deepLink = `${FRONTEND_URL}/phed/approvals/memos/${params.memoId}`

  console.log(`[PHED NOTIFY] Notifying creator ${name} — "${params.emailHeading}"`)

  await createNotification(
    creator.id,
    params.notificationType,
    params.title,
    params.message,
    { memoId: params.memoId, deepLink },
    params.companyId,
  ).catch(err => console.error('[PHED NOTIFY] creator in-app notification failed:', err))

  if (!creator.email) {
    console.warn(`[PHED NOTIFY] Skipping creator email for ${name} — no email address on record.`)
    return
  }

  await sendPhedApprovalNotificationEmail({
    to: creator.email,
    recipientName: name,
    companyName: company?.companyName ?? '',
    periodName: period.periodName,
    subjectLine: params.title,
    heading: params.emailHeading,
    bodyText: params.emailBody,
    deepLink,
    tone: params.tone,
  }).catch(err => console.error('[PHED NOTIFY] creator email failed:', err))
}

// Called after a forward action (recommend/approve/finalapprove) commits.
export async function notifyAfterForward(memo: PhedApprovalMemo, fromActorName: string): Promise<void> {
  console.log(
    `[PHED NOTIFY] forward memo=${memo.id} stage=${memo.currentStage} status=${memo.status} attempt=${memo.attemptNumber} actor="${fromActorName}"`,
  )
  if (memo.status === 'APPROVED') {
    // Final approval — notify the payroll creator, then Treasury.
    await notifyCreator({
      companyId: memo.companyId,
      payPeriodId: memo.payPeriodId,
      memoId: memo.id,
      notificationType: NOTIFICATION_TYPES.PHED_APPROVAL_FINAL,
      title: 'Payroll approval memo fully approved',
      message: `${fromActorName} (MD/CEO) gave final approval to the payroll approval memo.`,
      emailHeading: 'Final approval received',
      emailBody: `The Payroll Approval Memo has received final approval from ${fromActorName} (MD/CEO). You can now approve the pay period itself to unlock payslips.`,
      tone: 'info',
    })

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

  const isResubmission = memo.attemptNumber > 1
  const actorStage = getStageDef(memo.currentStage - 1)

  // Notify the payroll creator that the memo advanced (or was re-submitted).
  await notifyCreator({
    companyId: memo.companyId,
    payPeriodId: memo.payPeriodId,
    memoId: memo.id,
    notificationType: NOTIFICATION_TYPES.PHED_APPROVAL_PROGRESS,
    title: isResubmission ? 'Payroll approval memo re-submitted' : 'Payroll approval memo advanced',
    message: isResubmission
      ? `${fromActorName} re-submitted the payroll approval memo for approval. It is now with ${nextStage.label}.`
      : `${fromActorName}${actorStage ? ` (${actorStage.label})` : ''} approved the payroll approval memo. It is now with ${nextStage.label}.`,
    emailHeading: isResubmission ? 'Memo re-submitted' : 'Approval memo advanced',
    emailBody: isResubmission
      ? `${fromActorName} has re-submitted the Payroll Approval Memo after corrections. It is now with the next stage (${nextStage.label}).`
      : `${fromActorName}${actorStage ? ` (${actorStage.label})` : ''} has approved the Payroll Approval Memo and it has advanced to the next stage (${nextStage.label}).`,
    tone: isResubmission ? 'warning' : 'info',
  })

  await notifyRoleHolders({
    companyId: memo.companyId,
    accessRole: nextStage.role,
    memoId: memo.id,
    notificationType: NOTIFICATION_TYPES.PHED_APPROVAL_ACTION_NEEDED,
    title: isResubmission
      ? 'A corrected payroll memo has been re-submitted for your approval'
      : 'A payroll approval memo awaits your review',
    message: isResubmission
      ? `${fromActorName} re-submitted a corrected payroll approval memo to your desk.`
      : `${fromActorName} forwarded a payroll approval memo to your desk.`,
    emailHeading: isResubmission
      ? 'Re-submission — please review and approve again'
      : 'A payroll approval memo is awaiting your review',
    emailBody: isResubmission
      ? `${fromActorName} has re-submitted the Payroll Approval Memo after corrections were made. Please review the updated figures and approve again to continue the approval cycle.`
      : `${fromActorName} has forwarded this Payroll Approval Memo to your desk (${nextStage.label}). Please review and take action.`,
    tone: isResubmission ? 'warning' : 'info',
  })
}

// Called after a flag action commits — always returns to Stage 1.
export async function notifyAfterFlag(memo: PhedApprovalMemo, flaggedByActorName: string, comment: string): Promise<void> {
  console.log(
    `[PHED NOTIFY] flag memo=${memo.id} flaggedBy="${flaggedByActorName}" attempt=${memo.attemptNumber}`,
  )
  const stage1 = getStageDef(1)
  if (!stage1) return

  // Notify the payroll creator of the rejection/flag-back.
  await notifyCreator({
    companyId: memo.companyId,
    payPeriodId: memo.payPeriodId,
    memoId: memo.id,
    notificationType: NOTIFICATION_TYPES.PHED_APPROVAL_FLAGGED,
    title: 'Payroll approval memo flagged back for correction',
    message: `${flaggedByActorName} flagged the payroll approval memo back for correction: "${comment}"`,
    emailHeading: 'Memo flagged back for correction',
    emailBody: `${flaggedByActorName} flagged the Payroll Approval Memo back for correction. Their comment: "${comment}". Please correct the figures and resubmit.`,
    tone: 'warning',
  })

  await notifyRoleHolders({
    companyId: memo.companyId,
    accessRole: stage1.role,
    memoId: memo.id,
    notificationType: NOTIFICATION_TYPES.PHED_APPROVAL_FLAGGED,
    title: 'Payroll approval memo flagged back for correction',
    message: `${flaggedByActorName} flagged the payroll approval memo back to your desk: "${comment}"`,
    emailHeading: 'A payroll approval memo was flagged back for correction',
    emailBody: `${flaggedByActorName} flagged this Payroll Approval Memo back for correction. Their comment: "${comment}". Please correct the figures and resubmit.`,
    tone: 'warning',
  })
}
