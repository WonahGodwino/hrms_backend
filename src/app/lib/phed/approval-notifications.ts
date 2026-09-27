// Fans a notification + email out to every staff member holding a given
// PhedAccessRole for a company (a "desk" can have more than one holder —
// e.g. Treasury Team). Always fire-and-forget: a notification/email failure
// must never block or fail the approval action that triggered it.

import { prisma } from '@/app/lib/db'
import { PhedAccessRole, PhedApprovalMemo } from '@prisma/client'
import { createNotification, NOTIFICATION_TYPES } from '@/app/lib/notifications/helpers'
import { sendPhedApprovalNotificationEmail } from '@/app/lib/phed/email'
import { getStageDef, FINAL_STAGE } from '@/app/lib/phed/approval-stages'
import { signEmailActionToken } from '@/app/lib/phed/email-action-token'
import { buildApprovalMemoPdfBuffer } from '@/app/lib/phed/approval-memo-pdf'

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
  buttonLabel?: string
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
        buttonLabel: params.buttonLabel,
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

// The memo just landed at the MD/CEO's desk (Stage 6). Send a rich email with
// the signed memo PDF attached and one-click Approve / Reject links (signed
// tokens) so the MD/CEO can act from the inbox without logging in.
async function notifyMdFinalApproval(params: {
  memo: PhedApprovalMemo
  fromActorName: string
  isResubmission: boolean
}): Promise<void> {
  const { memo, fromActorName, isResubmission } = params

  const [holders, company, period] = await Promise.all([
    prisma.phedStaffAccessRole.findMany({
      where: { companyId: memo.companyId, accessRole: 'MD_CEO' },
      include: { staffRecord: { select: { id: true, email: true, firstName: true, lastName: true } } },
    }),
    prisma.company.findUnique({ where: { id: memo.companyId }, select: { companyName: true } }),
    prisma.phedPayPeriod.findUnique({ where: { id: memo.payPeriodId }, select: { periodName: true } }),
  ])

  if (holders.length === 0) {
    console.warn(`[PHED NOTIFY] No MD_CEO holders found for company ${memo.companyId} — final approval email not sent.`)
    return
  }

  const periodName = period?.periodName ?? ''
  const companyName = company?.companyName ?? ''
  const deepLink = `${FRONTEND_URL}/phed/approvals/memos/${memo.id}`

  const pdf = await buildApprovalMemoPdfBuffer(memo.id).catch((err) => {
    console.error('[PHED NOTIFY] memo PDF build failed:', err)
    return null
  })

  const API_ORIGIN = (
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BASE_API_URL?.replace(/\/api\/?$/, '') ||
    'https://hrms.isurfglobal.com'
  ).replace(/\/$/, '')

  for (const { staffRecord: staff } of holders) {
    if (!staff.email) {
      console.warn(`[PHED NOTIFY] MD_CEO holder ${staff.firstName} has no email — skipping.`)
      continue
    }
    const name = `${staff.firstName} ${staff.lastName}`.trim() || staff.email

    const approveLink = `${API_ORIGIN}/api/phed/approvals/memos/${memo.id}/email-action?token=${signEmailActionToken(memo.id, 'approve')}`
    const rejectLink = `${API_ORIGIN}/api/phed/approvals/memos/${memo.id}/email-action?token=${signEmailActionToken(memo.id, 'reject')}`

    await createNotification(
      staff.id,
      NOTIFICATION_TYPES.PHED_APPROVAL_ACTION_NEEDED,
      isResubmission
        ? 'A corrected payroll memo needs your final approval'
        : 'A payroll memo awaits your final approval',
      isResubmission
        ? `${fromActorName} re-submitted a corrected payroll approval memo for your final approval.`
        : `${fromActorName} forwarded a payroll approval memo for your final approval.`,
      { memoId: memo.id, deepLink },
      memo.companyId,
    ).catch((err) => console.error('[PHED NOTIFY] MD in-app notification failed:', err))

    await sendPhedApprovalNotificationEmail({
      to: staff.email,
      recipientName: name,
      companyName,
      periodName,
      subjectLine: isResubmission
        ? 'Final approval required — corrected payroll memo'
        : 'Final approval required — payroll memo',
      heading: 'Final approval required',
      bodyText: isResubmission
        ? `${fromActorName} has re-submitted the corrected Payroll Approval Memo for your final approval. The signed memo is attached; you can Approve or Reject directly from this email.`
        : `The Payroll Approval Memo has completed internal review and now awaits your final approval. The signed memo is attached; you can Approve or Reject directly from this email.`,
      deepLink,
      actionButtons: { approveLink, rejectLink },
      ...(pdf ? { attachments: [{ filename: pdf.fileName, data: pdf.data, contentType: 'application/pdf' }] } : {}),
    }).catch((err) => console.error('[PHED NOTIFY] MD final-approval email failed:', err))
  }
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
      emailBody: `The Payroll Approval Memo has completed the full six-stage review and received final approval. The Bank Schedule is now available to Treasury. An HR/Admin user must still approve the pay period itself to unlock payslip emails and move it to Paid.`,
    })
    return
  }

  // Tax Manager concurred → memo returns to the HR uploader for sign-off
  // before Internal Audit. Notify the creator explicitly.
  if (memo.status === 'PENDING_HR_APPROVAL') {
    await notifyCreator({
      companyId: memo.companyId,
      payPeriodId: memo.payPeriodId,
      memoId: memo.id,
      notificationType: NOTIFICATION_TYPES.PHED_APPROVAL_PROGRESS,
      title: 'Tax Manager concurred — awaiting your sign-off',
      message: `${fromActorName} (Tax Manager) concurred with the payroll approval memo. It is now back with you for sign-off before Internal Audit.`,
      emailHeading: 'Tax Manager concurred — your sign-off is required',
      emailBody: `${fromActorName} (Tax Manager) has concurred with the Payroll Approval Memo. Please review and sign off to release it to Head, Internal Audit.`,
      tone: 'info',
    })
    return
  }

  const nextStage = getStageDef(memo.currentStage)
  if (!nextStage) return

  const isResubmission = memo.attemptNumber > 1
  const actorStage = getStageDef(memo.currentStage - 1)
  const actorLabel = actorStage?.label ?? 'A reviewer'

  const period = await prisma.phedPayPeriod.findUnique({
    where: { id: memo.payPeriodId },
    select: { periodName: true },
  })
  const periodName = period?.periodName ?? ''

  // Standardized milestone copy: "<Role> approved the payroll for <Period>".
  const actionPhrase = isResubmission
    ? `${actorLabel} re-submitted the payroll for ${periodName}`
    : `${actorLabel} approved the payroll for ${periodName}`

  // The HR/ADMIN who submitted the memo (Stage 1) is the originator whose name
  // appears in the "has forwarded this … memo to your desk" wording sent to
  // every downstream desk.
  const originatorStamp = await prisma.phedApprovalStamp.findFirst({
    where: { memoId: memo.id, stage: 1, action: 'SUBMITTED' },
    orderBy: { createdAt: 'desc' },
    select: { actorName: true },
  })
  const originatorName = originatorStamp?.actorName || fromActorName

  // Tax Manager's desk uses "Payroll review Memo" + "Review Memo" button;
  // every other desk uses "Payroll Approval Memo" + "Approval Memo" button.
  const isTaxManager = nextStage.role === 'TAX_AUDIT'
  const memoLabel = isTaxManager ? 'Payroll review Memo' : 'Payroll Approval Memo'
  const forwardedBody = `${originatorName} has forwarded this ${memoLabel} to your desk. Please review and take action.`

  // Notify the payroll creator that the memo advanced (or was re-submitted).
  await notifyCreator({
    companyId: memo.companyId,
    payPeriodId: memo.payPeriodId,
    memoId: memo.id,
    notificationType: NOTIFICATION_TYPES.PHED_APPROVAL_PROGRESS,
    title: actionPhrase,
    message: `${actionPhrase}. It is now with ${nextStage.label}.`,
    emailHeading: isResubmission ? 'Payroll re-submitted' : 'Payroll approved',
    emailBody: `${actionPhrase}. It is now with ${nextStage.label}.`,
    tone: isResubmission ? 'warning' : 'info',
  })

  if (nextStage.role === 'MD_CEO') {
    // Final desk — send the memo PDF + one-click Approve/Reject buttons instead
    // of the generic notification email.
    await notifyMdFinalApproval({ memo, fromActorName, isResubmission })
  } else {
    await notifyRoleHolders({
      companyId: memo.companyId,
      accessRole: nextStage.role,
      memoId: memo.id,
      notificationType: NOTIFICATION_TYPES.PHED_APPROVAL_ACTION_NEEDED,
      title: `${memoLabel} forwarded for your review`,
      message: forwardedBody,
      emailHeading: `${memoLabel} forwarded to your desk`,
      emailBody: forwardedBody,
      buttonLabel: isTaxManager ? 'Review Memo' : 'Approval Memo',
      tone: isResubmission ? 'warning' : 'info',
    })
  }
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
