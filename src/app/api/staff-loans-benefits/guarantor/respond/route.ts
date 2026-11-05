// src/app/api/staff-loans-benefits/guarantor/respond/route.ts
//
// PUBLIC, token-based guarantor accept/decline flow — no login required.
// The primary guarantor consent mechanism (decision: keep the existing
// production email/token flow rather than requiring the guarantor to sign
// in). GET fetches the loan summary for the response page; POST records the
// decision via the shared resolveGuarantorDecision(), the same function the
// in-app Guarantor Dashboard route uses.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { verifyGuarantorToken } from '@/app/lib/email'
import { resolveGuarantorDecision } from '@/app/lib/staff-loans-benefits/guarantor'
import { computePlanMonthlyRepayment } from '@/app/lib/staff-loans-benefits/calculators'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) return withCors(ApiResponse.error('Token is required', 400), origin)

    const decoded = verifyGuarantorToken(token)
    if (!decoded) {
      return withCors(ApiResponse.error('Invalid or expired link. Please contact HR to resend the guarantor request.', 401), origin)
    }

    const loan = await prisma.loanRequest.findUnique({
      where: { id: decoded.loanRequestId },
      include: {
        staff: { select: { firstName: true, lastName: true, email: true, department: true, staffId: true } },
        company: { select: { companyName: true, baseCurrency: true } },
      },
    })
    if (!loan) return withCors(ApiResponse.error('Loan request not found', 404), origin)
    if (loan.guarantorToken !== token) {
      return withCors(ApiResponse.error('This link has already been used or superseded. Please contact HR.', 401), origin)
    }
    if (loan.guarantorStaffId !== decoded.guarantorStaffId) return withCors(ApiResponse.error('Invalid guarantor token', 401), origin)
    if (loan.guarantorTokenExpiry && loan.guarantorTokenExpiry < new Date()) {
      return withCors(ApiResponse.error('This link has expired. Please contact HR to resend the guarantor request.', 401), origin)
    }

    if (loan.guarantorStatus === 'ACCEPTED' || loan.guarantorStatus === 'DECLINED') {
      return withCors(ApiResponse.success({ alreadyResponded: true, decision: loan.guarantorStatus }), origin)
    }

    const monthlyRepayment = Number(loan.monthlyRepayment) || computePlanMonthlyRepayment(Number(loan.requestedAmount), Number(loan.interestRatePercent), loan.tenureMonths, Number(loan.processingFeeAmount ?? 0))

    return withCors(
      ApiResponse.success({
        alreadyResponded: false,
        loan: {
          id: loan.id,
          loanType: loan.loanType,
          requestedAmount: Number(loan.requestedAmount),
          tenureMonths: loan.tenureMonths,
          monthlyRepayment: Number(monthlyRepayment.toFixed(2)),
          interestRatePercent: Number(loan.interestRatePercent),
          totalRepayable: Number(loan.totalRepayable ?? monthlyRepayment * loan.tenureMonths),
          purpose: loan.purpose,
          createdAt: loan.createdAt,
          currency: loan.currencyCode || loan.company?.baseCurrency || 'NGN',
          companyName: loan.company?.companyName || '',
        },
        applicant: {
          name: `${loan.staff.firstName} ${loan.staff.lastName}`.trim(),
          email: loan.staff.email,
          department: loan.staff.department || '',
          staffId: loan.staff.staffId || '',
        },
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const body = await request.json()
    const token = String(body.token || '').trim()
    const decisionRaw = String(body.decision || '').toUpperCase().trim()
    const declineReason = String(body.declineReason || '').trim()

    if (!token) return withCors(ApiResponse.error('Token is required', 400), origin)
    if (!['ACCEPT', 'DECLINE'].includes(decisionRaw)) return withCors(ApiResponse.error('decision must be ACCEPT or DECLINE', 400), origin)
    if (decisionRaw === 'DECLINE' && !declineReason) return withCors(ApiResponse.error('Please provide a reason for declining', 400), origin)

    const decoded = verifyGuarantorToken(token)
    if (!decoded) return withCors(ApiResponse.error('Invalid or expired link', 401), origin)

    const loan = await prisma.loanRequest.findUnique({ where: { id: decoded.loanRequestId }, select: { guarantorToken: true, guarantorTokenExpiry: true } })
    if (!loan) return withCors(ApiResponse.error('Loan request not found', 404), origin)
    if (loan.guarantorToken !== token) return withCors(ApiResponse.error('This link has already been used or is no longer valid', 401), origin)
    if (loan.guarantorTokenExpiry && loan.guarantorTokenExpiry < new Date()) {
      return withCors(ApiResponse.error('This link has expired. Please contact HR.', 401), origin)
    }

    const updated = await resolveGuarantorDecision({
      loanRequestId: decoded.loanRequestId,
      guarantorStaffId: decoded.guarantorStaffId,
      decision: decisionRaw === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED',
      declineReason: decisionRaw === 'DECLINE' ? declineReason : undefined,
    })

    return withCors(ApiResponse.success(updated, `Guarantor request ${decisionRaw === 'ACCEPT' ? 'accepted' : 'declined'}`), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
