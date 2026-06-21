import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { extractBearerToken, findStaffByEmail, findStaffByEmailAndCompany, findStaffById, resolveScopedCompanyIds } from '@/app/api/staff-loans-benefits/_helpers'
import { prisma } from '@/app/lib/db'
import Decimal from 'decimal.js'
import { generateGuarantorToken, sendGuarantorRequestEmail } from '@/app/lib/email'
import { createNotification } from '@/app/lib/notifications/helpers'

const MIN_TENURE = 1
const MAX_TENURE = 36
const MIN_PURPOSE_LENGTH = 10
const MIN_REQUESTED_AMOUNT = 1000

// Standard loan amortization formula. Returns monthly repayment.
function computeMonthlyRepayment(principal: number, annualRatePct: number, months: number): number {
  if (months <= 0) return 0
  if (annualRatePct <= 0) return principal / months
  const r = annualRatePct / 100 / 12
  const factor = Math.pow(1 + r, months)
  return (principal * r * factor) / (factor - 1)
}

// Resolve a LoanPolicy for a company by policy ID (preferred) or name (fallback).
// Name matching handles both plain strings ("Personal Loan") and the legacy
// UPPER_SNAKE_CASE format ("PERSONAL_LOAN") that older clients may still send.
async function resolveLoanPolicy(companyId: string, loanPolicyId: string | null, loanType: string) {
  if (loanPolicyId) {
    const byId = await prisma.loanPolicy.findFirst({
      where: { id: loanPolicyId, companyId, isActive: true },
    })
    if (byId) return byId
  }

  // Try exact name match (case-insensitive)
  const byName = await prisma.loanPolicy.findFirst({
    where: {
      companyId,
      isActive: true,
      name: { equals: loanType, mode: 'insensitive' },
    },
  })
  if (byName) return byName

  // Convert UPPER_SNAKE_CASE → Title Case and retry
  const titleCase = loanType
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')

  if (titleCase !== loanType) {
    return prisma.loanPolicy.findFirst({
      where: {
        companyId,
        isActive: true,
        name: { equals: titleCase, mode: 'insensitive' },
      },
    })
  }

  return null
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const token = extractBearerToken(request.headers.get('authorization'))
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'STAFF'])

    const body = await request.json()

    const loanType = String(body.loanType || '').trim()
    const loanPolicyId = body.loanPolicyId ? String(body.loanPolicyId).trim() : null
    const requestedAmount = Number(body.requestedAmount || 0)
    const tenureMonths = Number(body.tenureMonths || 0)
    const purpose = String(body.purpose || '').trim()
    const requestedCompanyId = body.companyId ? String(body.companyId).trim() : null
    const targetStaffId = body.targetStaffId ? String(body.targetStaffId).trim() : null
    const guarantorStaffId = body.guarantorStaffId ? String(body.guarantorStaffId).trim() : null
    const signature = body.signature ? String(body.signature).trim() : null
    const signatureType = body.signatureType ? String(body.signatureType).trim() : null

    if (!loanType) {
      return withCors(ApiResponse.error('loanType is required', 400), origin)
    }

    if (!Number.isFinite(requestedAmount) || requestedAmount < MIN_REQUESTED_AMOUNT) {
      return withCors(
        ApiResponse.error(`requestedAmount must be at least ${MIN_REQUESTED_AMOUNT}`, 400),
        origin
      )
    }

    if (!Number.isFinite(tenureMonths) || tenureMonths < MIN_TENURE || tenureMonths > MAX_TENURE) {
      return withCors(
        ApiResponse.error(`tenureMonths must be between ${MIN_TENURE} and ${MAX_TENURE}`, 400),
        origin
      )
    }

    if (!purpose || purpose.length < MIN_PURPOSE_LENGTH) {
      return withCors(
        ApiResponse.error(`purpose must be at least ${MIN_PURPOSE_LENGTH} characters`, 400),
        origin
      )
    }

    // Resolve the staff member submitting the request.
    // When a companyId is supplied (e.g. ADMIN/SUPER_ADMIN operating in a selected company),
    // scope the lookup to that company so the loan is attributed correctly.
    const actorStaff = requestedCompanyId
      ? await findStaffByEmailAndCompany(user.email, requestedCompanyId)
      : await findStaffByEmail(user.email)

    if (!actorStaff) {
      const msg = requestedCompanyId
        ? `You don't have a staff record in the selected company. Ask HR to create one, or use the on-behalf-of flow to submit for another staff member.`
        : 'Staff record not found'
      return withCors(ApiResponse.error(msg, 404), origin)
    }

    let requesterStaff = actorStaff

    // Admin/HR can submit on behalf of another staff member
    if (targetStaffId) {
      if (!['SUPER_ADMIN', 'ADMIN', 'HR'].includes(user.role)) {
        return withCors(
          ApiResponse.error('Only SUPER_ADMIN, ADMIN, or HR can submit requests for other staff', 403),
          origin
        )
      }
      const targetStaff = await findStaffById(targetStaffId)
      if (!targetStaff || !targetStaff.isActive) {
        return withCors(ApiResponse.error('Target staff not found or inactive', 404), origin)
      }
      requesterStaff = { ...targetStaff, role: targetStaff.role || 'STAFF' }
    }

    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (!scopedCompanyIds.includes(requesterStaff.companyId)) {
      return withCors(ApiResponse.error('You do not have access to this staff company', 403), origin)
    }

    // ── Resolve loan policy by ID or name against the company's defined types ──
    const matchedPolicy = await resolveLoanPolicy(
      requesterStaff.companyId,
      loanPolicyId,
      loanType
    )

    if (!matchedPolicy) {
      return withCors(
        ApiResponse.error(
          `Loan type "${loanType}" is not a recognised loan product for this company. Please select from the available loan types.`,
          400
        ),
        origin
      )
    }

    // ── Guarantor validation ──
    let validatedGuarantor: { id: string; firstName: string; lastName: string; email: string } | null = null
    if (guarantorStaffId && matchedPolicy.requiresGuarantor) {
      const guarantor = await prisma.staffRecord.findFirst({
        where: { id: guarantorStaffId, companyId: requesterStaff.companyId },
        select: { id: true, isActive: true, firstName: true, lastName: true, email: true },
      })

      if (!guarantor) {
        return withCors(ApiResponse.error('Guarantor not found in this company', 400), origin)
      }
      if (!guarantor.isActive) {
        return withCors(ApiResponse.error('Guarantor is not an active staff member', 400), origin)
      }

      if (matchedPolicy.guarantorMustNotHaveActiveLoan) {
        const activeLoans = await prisma.deductionEntry.count({
          where: {
            staffId: guarantor.id,
            deductionType: { in: ['LOAN', 'SALARY_ADVANCE'] },
            companyId: requesterStaff.companyId,
          },
        })
        if (activeLoans > 0) {
          return withCors(
            ApiResponse.error('Guarantor has active loan(s) and the policy does not allow this', 400),
            origin
          )
        }
      }
      validatedGuarantor = { id: guarantor.id, firstName: guarantor.firstName, lastName: guarantor.lastName, email: guarantor.email }
    }

    // ── Compute monthly repayment using the policy interest rate ──
    const policyInterestRate = Number(matchedPolicy.interestRatePercent ?? 0)
    const monthlyRepayment = computeMonthlyRepayment(requestedAmount, policyInterestRate, tenureMonths)
    const expectedRepaymentDate = new Date()
    expectedRepaymentDate.setMonth(expectedRepaymentDate.getMonth() + tenureMonths)

    const needsGuarantor = !!(validatedGuarantor && matchedPolicy.requiresGuarantor)

    const loanRequest = await prisma.loanRequest.create({
      data: {
        companyId: requesterStaff.companyId,
        staffId: requesterStaff.id,
        loanType: matchedPolicy.name,
        requestedAmount: new Decimal(requestedAmount),
        tenureMonths,
        purpose,
        status: 'PENDING',
        monthlyRepayment: new Decimal(Number(monthlyRepayment.toFixed(2))),
        expectedRepaymentDate,
        interestRate: new Decimal(policyInterestRate),
        ...(signature
          ? { signature, signatureType: signatureType || 'drawn', signedAt: new Date() }
          : {}),
        ...(needsGuarantor && validatedGuarantor
          ? { guarantorStaffId: validatedGuarantor.id, guarantorStatus: 'PENDING' }
          : {}),
        createdBy: user.userId,
      },
      select: {
        id: true,
        companyId: true,
        staffId: true,
        loanType: true,
        requestedAmount: true,
        tenureMonths: true,
        monthlyRepayment: true,
        interestRate: true,
        purpose: true,
        status: true,
        guarantorStatus: true,
        createdAt: true,
        expectedRepaymentDate: true,
      },
    })

    // ── Guarantor notification & email (fire-and-forget) ──
    if (needsGuarantor && validatedGuarantor) {
      const g = validatedGuarantor
      const { token, expiry } = generateGuarantorToken(loanRequest.id, g.id)

      prisma.loanRequest.update({
        where: { id: loanRequest.id },
        data: { guarantorToken: token, guarantorTokenExpiry: expiry },
      }).catch(err => console.error('[Guarantor token save error]', err))

      const baseCurrency = (await prisma.company.findUnique({
        where: { id: requesterStaff.companyId },
        select: { baseCurrency: true },
      }))?.baseCurrency || 'NGN'

      const applicantName = `${requesterStaff.firstName || ''} ${requesterStaff.lastName || ''}`.trim() || user.email
      const guarantorName = `${g.firstName} ${g.lastName}`.trim()

      sendGuarantorRequestEmail({
        guarantorEmail: g.email,
        guarantorName,
        applicantName,
        loanType: loanRequest.loanType,
        amount: Number(loanRequest.requestedAmount),
        tenureMonths: loanRequest.tenureMonths,
        monthlyRepayment: Number(loanRequest.monthlyRepayment),
        purpose: loanRequest.purpose || '',
        token,
        currency: baseCurrency,
      }).catch(err => console.error('[Guarantor email error]', err))

      createNotification(
        g.id,
        'LOAN_GUARANTOR_REQUEST',
        'Guarantor Request',
        `${applicantName} has requested you as guarantor for a ${loanRequest.loanType} of ${baseCurrency} ${Number(loanRequest.requestedAmount).toLocaleString()}. Please check your email to respond.`,
        { loanRequestId: loanRequest.id, applicantName, amount: Number(loanRequest.requestedAmount) },
        requesterStaff.companyId
      ).catch(err => console.error('[Guarantor notification error]', err))
    }

    return withCors(
      ApiResponse.success(
        {
          id: loanRequest.id,
          companyId: loanRequest.companyId,
          staffId: loanRequest.staffId,
          loanType: loanRequest.loanType,
          requestedAmount: Number(loanRequest.requestedAmount),
          tenureMonths: loanRequest.tenureMonths,
          monthlyRepayment: Number(loanRequest.monthlyRepayment),
          interestRate: Number(loanRequest.interestRate),
          purpose: loanRequest.purpose,
          status: loanRequest.status,
          guarantorStatus: loanRequest.guarantorStatus,
          expectedRepaymentDate: loanRequest.expectedRepaymentDate,
          createdAt: loanRequest.createdAt,
        },
        needsGuarantor
          ? 'Loan request submitted. Your guarantor has been notified via email to accept or decline.'
          : 'Loan request submitted successfully',
        201
      ),
      origin
    )
  } catch (error) {
    console.error('[LoanRequests POST]', error)
    return withCors(handleApiError(error), origin)
  }
}
