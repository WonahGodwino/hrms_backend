// src/app/api/staff-loans-benefits/loan-requests/route.ts
//
// POST — submit a loan application. Snapshots the resolved policy terms +
//        approval workflow onto the request so a later policy edit/publish
//        never rewrites an in-flight application. Enters PENDING_GUARANTOR
//        if the policy requires one, otherwise goes straight into the
//        approval chain.
// GET   — list loan requests: self (own) for any role without LOAN_MANAGEMENT
//         page access, org-wide for those with it (optionally filtered),
//         backing both MyLoans.jsx and (richer response) LoanManagementAdmin.jsx.
//         All module roles (SUPER_ADMIN/ADMIN/HR/MANAGER/STAFF — see ALL_ROLES)
//         can reach the endpoint; data scope is decided by page access, not role.
import { assertTrialCapacity } from '@/app/lib/trial/guard'
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess, ALL_ROLES } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { computePlanMonthlyRepayment, computeProcessingFee, computeTotalRepayable, evaluateLoanEligibility, resolveInterestRate } from '@/app/lib/staff-loans-benefits/calculators'
import { resolveExistingMonthlyDebt, resolveMonthsEmployed, resolveStaffGrossSalary, resolveStaffNetSalary } from '@/app/lib/staff-loans-benefits/staff-finance'
import { enterApprovalChain, resolveApproverStaffIds } from '@/app/lib/staff-loans-benefits/approval-engine'
import { canAccessPage } from '@/app/lib/staff-loans-benefits/page-access'
import { logStaffActivity } from '@/app/lib/device/device-utils'
import { createNotification, NOTIFICATION_TYPES } from '@/app/lib/notifications/helpers'
import { generateGuarantorToken, sendGuarantorRequestEmail } from '@/app/lib/email'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

const MIN_TENURE = 1
const MAX_TENURE = 36
const MIN_PURPOSE_LENGTH = 10
const MIN_REQUESTED_AMOUNT = 1000

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ALL_ROLES)

    const body = await request.json()
    const { loanPolicyId, amount, tenureMonths, purpose, guarantorStaffId, signature, signatureType, documentUrls } = body || {}

    if (!loanPolicyId) return withCors(ApiResponse.error('loanPolicyId is required', 400), origin)
    if (!amount || amount < MIN_REQUESTED_AMOUNT) return withCors(ApiResponse.error(`Amount must be at least ${MIN_REQUESTED_AMOUNT}`, 400), origin)
    if (!tenureMonths || tenureMonths < MIN_TENURE || tenureMonths > MAX_TENURE) {
      return withCors(ApiResponse.error(`Tenure must be between ${MIN_TENURE} and ${MAX_TENURE} months`, 400), origin)
    }
    // Purpose/description is optional — when provided it is trimmed, and a
    // too-short non-empty value is still rejected to avoid meaningless
    // one-character entries.
    if (purpose && purpose.trim().length > 0 && purpose.trim().length < MIN_PURPOSE_LENGTH) {
      return withCors(ApiResponse.error(`Purpose must be at least ${MIN_PURPOSE_LENGTH} characters, or left empty`, 400), origin)
    }

    const staff = await prisma.staffRecord.findUnique({ where: { id: user.userId } })
    if (!staff) return withCors(ApiResponse.error('Staff record not found', 404), origin)

    const [policy, company] = await Promise.all([
      prisma.loanPolicy.findUnique({ where: { id: loanPolicyId } }),
      prisma.company.findUnique({ where: { id: staff.companyId }, select: { baseCurrency: true } }),
    ])
    if (!policy || policy.companyId !== staff.companyId || policy.status !== 'PUBLISHED' || !policy.isActive) {
      return withCors(ApiResponse.error('Loan policy not found or not available', 404), origin)
    }
    if (tenureMonths > policy.maxDurationMonths) {
      return withCors(ApiResponse.error(`Duration exceeds this policy's maximum of ${policy.maxDurationMonths} months`, 400), origin)
    }

    const activeLoanCount = await prisma.loanRequest.count({
      where: { staffId: staff.id, status: { in: ['PENDING_GUARANTOR', 'PENDING_APPROVAL', 'APPROVED', 'DISBURSED'] } },
    })
    if (activeLoanCount >= policy.maxActiveLoansPerStaff) {
      return withCors(ApiResponse.error(`You already have the maximum number of active loans (${policy.maxActiveLoansPerStaff}) allowed under this policy`, 400), origin)
    }

    const interestRatePercent = resolveInterestRate(policy, tenureMonths)
    // interestRatePercent is a MONTHLY flat rate on principal (1 => 1% of the
    // principal each month). The processing fee is charged on top and is
    // recovered inside the plan, so totalRepayable = principal + interest + fee.
    const processingFeeAmount = computeProcessingFee(amount, Number(policy.processingFeePercent))
    const totalRepayable = computeTotalRepayable(amount, interestRatePercent, tenureMonths, processingFeeAmount)
    const monthlyRepayment = Math.round(computePlanMonthlyRepayment(amount, interestRatePercent, tenureMonths, processingFeeAmount) * 100) / 100

    const [grossSalary, netSalary, monthsEmployed, existingMonthlyDebt] = await Promise.all([
      resolveStaffGrossSalary(staff.id),
      resolveStaffNetSalary(staff.id),
      resolveMonthsEmployed(staff.id),
      resolveExistingMonthlyDebt(staff.id),
    ])
    const eligibility = evaluateLoanEligibility({
      requestedAmount: amount,
      requestedMonthlyRepayment: monthlyRepayment,
      grossSalary,
      netSalary,
      existingMonthlyDebt,
      monthsEmployed,
      policy: {
        minServiceMonths: policy.minServiceMonths,
        maxAmount: Number(policy.maxAmount),
        salaryMultiplier: Number(policy.salaryMultiplier),
        maxDebtRatioPercent: Number(policy.maxDebtRatioPercent),
      },
    })
    if (!eligibility.isEligible) {
      return withCors(ApiResponse.error(eligibility.reason || 'You are not currently eligible for this loan', 400), origin)
    }

    const requiresGuarantor = policy.requiresGuarantor && (!policy.guarantorThresholdAmount || amount >= Number(policy.guarantorThresholdAmount))
    let guarantor: { id: string; firstName: string; lastName: string; email: string; companyId: string; isActive: boolean } | null = null

    if (requiresGuarantor) {
      if (!guarantorStaffId) return withCors(ApiResponse.error('A guarantor is required for this loan', 400), origin)
      if (guarantorStaffId === staff.id) return withCors(ApiResponse.error('You cannot be your own guarantor', 400), origin)

      guarantor = await prisma.staffRecord.findUnique({
        where: { id: guarantorStaffId },
        select: { id: true, firstName: true, lastName: true, email: true, companyId: true, isActive: true },
      })
      if (!guarantor) return withCors(ApiResponse.error('Guarantor not found', 404), origin)
      if (policy.guarantorMustBeActiveInCompany && (guarantor.companyId !== staff.companyId || !guarantor.isActive)) {
        return withCors(ApiResponse.error('Guarantor must be an active staff member in your company', 400), origin)
      }
      if (policy.guarantorMustNotHaveActiveLoan) {
        const guarantorActiveLoan = await prisma.loanRequest.count({ where: { staffId: guarantor.id, status: 'DISBURSED' } })
        if (guarantorActiveLoan > 0) {
          return withCors(ApiResponse.error('This guarantor already has an active loan and cannot guarantee another', 400), origin)
        }
      }
    }

    const currencyCode = company?.baseCurrency || 'NGN'
    const approvalWorkflow = policy.approvalWorkflow as any

    await assertTrialCapacity(staff.companyId, 'sampleLoans')

    let loanRequest = await prisma.loanRequest.create({
      data: {
        companyId: staff.companyId,
        staffId: staff.id,
        loanPolicyId: policy.id,
        loanPolicyVersion: policy.version,
        loanType: policy.name,
        requestedAmount: amount,
        tenureMonths,
        purpose: purpose?.trim() || null,
        currencyCode,
        interestRatePercent,
        processingFeePercent: policy.processingFeePercent,
        processingFeeAmount,
        monthlyRepayment,
        totalRepayable,
        approvalWorkflow,
        status: requiresGuarantor ? 'PENDING_GUARANTOR' : 'PENDING_APPROVAL',
        guarantorStaffId: guarantor?.id,
        guarantorStatus: requiresGuarantor ? 'PENDING' : 'NOT_REQUIRED',
        // Review & Submit attachments (Apply-for-Loan wizard): supporting docs
        // (POP) via the upload endpoint, plus the employee's signature (drawn
        // canvas data-URL or uploaded image URL).
        signature: typeof signature === 'string' && signature ? signature : undefined,
        signatureType: signatureType === 'DRAWN' || signatureType === 'UPLOADED' ? signatureType : undefined,
        signedAt: signature ? new Date() : undefined,
        documentUrls: Array.isArray(documentUrls) ? documentUrls.filter((u: unknown) => typeof u === 'string' && u) : undefined,
        createdBy: user.userId,
      },
    })

    if (requiresGuarantor && guarantor) {
      const { token: guarantorToken, expiry } = generateGuarantorToken(loanRequest.id, guarantor.id)
      loanRequest = await prisma.loanRequest.update({ where: { id: loanRequest.id }, data: { guarantorToken, guarantorTokenExpiry: expiry } })

      await sendGuarantorRequestEmail({
        guarantorEmail: guarantor.email,
        guarantorName: `${guarantor.firstName} ${guarantor.lastName}`,
        applicantName: `${staff.firstName} ${staff.lastName}`,
        loanType: policy.name,
        amount,
        tenureMonths,
        monthlyRepayment,
        purpose,
        token: guarantorToken,
        currency: currencyCode,
      }).catch((e) => console.error('Failed to send guarantor request email:', e))

      await createNotification(
        guarantor.id,
        NOTIFICATION_TYPES.LOAN_GUARANTOR_REQUEST,
        'You have been asked to guarantee a loan',
        `${staff.firstName} ${staff.lastName} has asked you to guarantee their ${policy.name} application.`,
        { loanRequestId: loanRequest.id },
        staff.companyId
      )
    } else {
      const entry = await enterApprovalChain({
        companyId: staff.companyId,
        requestingStaffId: staff.id,
        requestType: 'LOAN_REQUEST',
        requestId: loanRequest.id,
        workflow: approvalWorkflow,
      })
      loanRequest = await prisma.loanRequest.update({ where: { id: loanRequest.id }, data: entry })

      const approverIds = await resolveApproverStaffIds({ ...entry, companyId: staff.companyId })
      await Promise.all(
        approverIds.map((id) =>
          createNotification(
            id,
            NOTIFICATION_TYPES.APPROVAL_ACTION_NEEDED,
            'A loan request needs your approval',
            `${staff.firstName} ${staff.lastName} has applied for a ${policy.name} of ${amount}.`,
            { loanRequestId: loanRequest.id },
            staff.companyId
          )
        )
      )
    }

    await logStaffActivity({
      staffRecordId: staff.id,
      companyId: staff.companyId,
      action: 'LOAN_APPLIED',
      performedById: staff.id,
      performedByName: `${staff.firstName} ${staff.lastName}`,
      performedByRole: user.role,
      details: { loanRequestId: loanRequest.id, loanType: policy.name, amount },
    })

    return withCors(ApiResponse.success(loanRequest, 'Loan application submitted'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ALL_ROLES)

    const { searchParams } = new URL(request.url)
    // Org-wide access is governed purely by LOAN_MANAGEMENT page access
    // (SUPER_ADMIN always passes via canAccessPage) — role no longer gates
    // it. Anyone without access degrades to their own personal loans (same
    // as a STAFF caller) rather than being 403'd — this GET doubles as
    // MyLoans.jsx's self-service listing.
    const isManager = await canAccessPage('LOAN_MANAGEMENT', user)
    const status = searchParams.get('status')
    const staffIdParam = searchParams.get('staffId')

    const where: any = {}
    if (isManager) {
      if (!user.companyId) return withCors(ApiResponse.success({ loans: [] }), origin)
      where.companyId = user.companyId
      if (staffIdParam) where.staffId = staffIdParam
    } else {
      where.staffId = user.userId
    }
    if (status) where.status = status

    const loans = await prisma.loanRequest.findMany({
      where,
      include: {
        staff: { select: { id: true, firstName: true, lastName: true, email: true, department: true, avatarUrl: true } },
        guarantor: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    // Next unpaid installment due date per loan — the real "next deduction"
    // date, cycled from the persisted repayment plan (earliest installment not
    // yet PAID/WAIVED). expectedRepaymentDate is the FINAL installment's date,
    // so the UI must not use it for the next-deduction banner. MISSED
    // installments still count — they're unpaid and owed.
    const loanIds = loans.map((l) => l.id)
    const unpaidInstallments = loanIds.length
      ? await prisma.loanInstallment.findMany({
          where: {
            loanRequestId: { in: loanIds },
            status: { notIn: ['PAID', 'WAIVED'] },
          },
          orderBy: { dueDate: 'asc' },
          select: { loanRequestId: true, dueDate: true, status: true },
        })
      : []
    const nextDueByLoan = new Map<string, Date>()
    for (const inst of unpaidInstallments) {
      if (!nextDueByLoan.has(inst.loanRequestId)) nextDueByLoan.set(inst.loanRequestId, inst.dueDate)
    }

    // Repayment progress for the UI's Progress column/bar: money repaid
    // (totalRepayable − remainingBalance, the latter actively maintained by
    // disbursement/payroll deduction/force-recovery) over totalRepayable.
    // Non-disbursed loans have nothing to repay yet → 0%.
    const loansWithProgress = loans.map((l) => {
      const total = Number(l.totalRepayable ?? 0)
      const remaining = Number(l.remainingBalance ?? 0)
      const repaid = total > 0 ? Math.min(total, Math.max(0, total - remaining)) : 0
      const progressPercent =
        total > 0 && (l.status === 'DISBURSED' || l.status === 'REPAID')
          ? Math.min(100, Math.round((repaid / total) * 100))
          : 0
      const nextInstallmentDue = nextDueByLoan.get(l.id) ?? null
      return { ...l, progressPercent, nextInstallmentDue }
    })

    return withCors(ApiResponse.success({ loans: loansWithProgress }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
