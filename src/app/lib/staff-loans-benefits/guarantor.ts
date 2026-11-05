// src/app/lib/staff-loans-benefits/guarantor.ts
// Shared decision logic for the guarantor accept/decline flow — called
// identically by the public token-based route (guarantor/respond) and the
// in-app Guarantor Dashboard route (guarantor/[loanRequestId]/respond), so
// both channels write to exactly the same state.
import { prisma } from '@/app/lib/db'
import { enterApprovalChain, resolveApproverStaffIds } from './approval-engine'
import { logStaffActivity } from '@/app/lib/device/device-utils'
import { createNotification, NOTIFICATION_TYPES } from '@/app/lib/notifications/helpers'
import { sendGuarantorResponseEmail } from '@/app/lib/email'

export async function resolveGuarantorDecision(params: {
  loanRequestId: string
  guarantorStaffId: string
  decision: 'ACCEPTED' | 'DECLINED'
  declineReason?: string
}) {
  const loan = await prisma.loanRequest.findUnique({
    where: { id: params.loanRequestId },
    include: { staff: { select: { id: true, firstName: true, lastName: true, email: true } } },
  })
  if (!loan) throw new Error('Loan request not found')
  if (loan.guarantorStaffId !== params.guarantorStaffId) throw new Error('You are not the guarantor for this loan request')
  if (loan.guarantorStatus !== 'PENDING') throw new Error('This guarantor request has already been responded to')

  const guarantor = await prisma.staffRecord.findUnique({ where: { id: params.guarantorStaffId }, select: { firstName: true, lastName: true } })
  const guarantorName = guarantor ? `${guarantor.firstName} ${guarantor.lastName}` : 'Guarantor'

  if (params.decision === 'DECLINED') {
    const updated = await prisma.loanRequest.update({
      where: { id: loan.id },
      data: {
        guarantorStatus: 'DECLINED',
        guarantorRespondedAt: new Date(),
        guarantorDeclineReason: params.declineReason || undefined,
        status: 'REJECTED',
        rejectionReason: `Guarantor declined: ${params.declineReason || 'no reason given'}`,
        guarantorToken: null,
        guarantorTokenExpiry: null,
      },
    })

    await logStaffActivity({
      staffRecordId: loan.staffId,
      companyId: loan.companyId,
      action: 'GUARANTOR_CONSENT_DECLINED',
      performedById: params.guarantorStaffId,
      performedByName: guarantorName,
      performedByRole: 'STAFF',
      details: { loanRequestId: loan.id, reason: params.declineReason },
    })

    await createNotification(
      loan.staffId,
      NOTIFICATION_TYPES.LOAN_GUARANTOR_DECLINED,
      'Your guarantor declined',
      `${guarantorName} declined to guarantee your ${loan.loanType} application.`,
      { loanRequestId: loan.id },
      loan.companyId
    )

    sendGuarantorResponseEmail({
      applicantEmail: loan.staff.email,
      applicantName: `${loan.staff.firstName} ${loan.staff.lastName}`,
      guarantorName,
      loanType: loan.loanType,
      amount: Number(loan.requestedAmount),
      decision: 'DECLINED',
      declineReason: params.declineReason,
      currency: loan.currencyCode,
    }).catch((e) => console.error('Failed to send guarantor response email:', e))

    return updated
  }

  // ACCEPTED — enter the approval chain.
  const entry = await enterApprovalChain({
    companyId: loan.companyId,
    requestingStaffId: loan.staffId,
    requestType: 'LOAN_REQUEST',
    requestId: loan.id,
    workflow: loan.approvalWorkflow as any,
  })

  const updated = await prisma.loanRequest.update({
    where: { id: loan.id },
    data: {
      guarantorStatus: 'ACCEPTED',
      guarantorRespondedAt: new Date(),
      status: 'PENDING_APPROVAL',
      guarantorToken: null,
      guarantorTokenExpiry: null,
      ...entry,
    },
  })

  await logStaffActivity({
    staffRecordId: loan.staffId,
    companyId: loan.companyId,
    action: 'GUARANTOR_CONSENT_GIVEN',
    performedById: params.guarantorStaffId,
    performedByName: guarantorName,
    performedByRole: 'STAFF',
    details: { loanRequestId: loan.id },
  })

  await createNotification(
    loan.staffId,
    NOTIFICATION_TYPES.LOAN_GUARANTOR_ACCEPTED,
    'Your guarantor accepted',
    `${guarantorName} accepted to guarantee your ${loan.loanType} application. It's now awaiting approval.`,
    { loanRequestId: loan.id },
    loan.companyId
  )

  sendGuarantorResponseEmail({
    applicantEmail: loan.staff.email,
    applicantName: `${loan.staff.firstName} ${loan.staff.lastName}`,
    guarantorName,
    loanType: loan.loanType,
    amount: Number(loan.requestedAmount),
    decision: 'ACCEPTED',
    currency: loan.currencyCode,
  }).catch((e) => console.error('Failed to send guarantor response email:', e))

  const approverIds = await resolveApproverStaffIds({ ...entry, companyId: loan.companyId })
  await Promise.all(
    approverIds.map((id) =>
      createNotification(
        id,
        NOTIFICATION_TYPES.APPROVAL_ACTION_NEEDED,
        'A loan request needs your approval',
        `A ${loan.loanType} application (guarantor accepted) is awaiting your approval.`,
        { loanRequestId: loan.id },
        loan.companyId
      )
    )
  )

  return updated
}
