import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { verifyGuarantorToken, sendGuarantorResponseEmail } from '@/app/lib/email'
import { createNotification } from '@/app/lib/notifications/helpers'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// GET /api/staff-loans-benefits/loan-requests/guarantor?token=... — fetch loan details for the response page
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) {
      return withCors(ApiResponse.error('Token is required', 400), origin)
    }

    const decoded = verifyGuarantorToken(token)
    if (!decoded) {
      return withCors(ApiResponse.error('Invalid or expired link. Please contact HR to resend the guarantor request.', 401), origin)
    }

    const loan = await prisma.loanRequest.findUnique({
      where: { id: decoded.loanRequestId },
      select: {
        id: true,
        loanType: true,
        requestedAmount: true,
        tenureMonths: true,
        monthlyRepayment: true,
        interestRate: true,
        purpose: true,
        status: true,
        guarantorStatus: true,
        guarantorStaffId: true,
        guarantorToken: true,
        guarantorTokenExpiry: true,
        createdAt: true,
        companyId: true,
        staff: {
          select: { firstName: true, lastName: true, email: true, department: true, staffId: true },
        },
        company: {
          select: { companyName: true, baseCurrency: true },
        },
      },
    })

    if (!loan) {
      return withCors(ApiResponse.error('Loan request not found', 404), origin)
    }

    // Verify this token matches what is stored and the guarantorStaffId matches
    if (loan.guarantorToken !== token) {
      return withCors(ApiResponse.error('This link has already been used or superseded. Please contact HR.', 401), origin)
    }

    if (loan.guarantorStaffId !== decoded.guarantorStaffId) {
      return withCors(ApiResponse.error('Invalid guarantor token', 401), origin)
    }

    if (loan.guarantorTokenExpiry && loan.guarantorTokenExpiry < new Date()) {
      return withCors(ApiResponse.error('This link has expired. Please contact HR to resend the guarantor request.', 401), origin)
    }

    // If already responded, inform them
    if (loan.guarantorStatus === 'ACCEPTED') {
      return withCors(
        ApiResponse.success({ alreadyResponded: true, decision: 'ACCEPTED' }, 'You have already accepted this guarantor request'),
        origin
      )
    }
    if (loan.guarantorStatus === 'DECLINED') {
      return withCors(
        ApiResponse.success({ alreadyResponded: true, decision: 'DECLINED' }, 'You have already declined this guarantor request'),
        origin
      )
    }

    const r = Number(loan.interestRate ?? 0) / 100 / 12
    const n = loan.tenureMonths
    const P = Number(loan.requestedAmount)
    const computedMonthly = Number(loan.monthlyRepayment ?? 0) ||
      (r > 0 ? (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : P / n)

    return withCors(
      ApiResponse.success({
        alreadyResponded: false,
        loan: {
          id: loan.id,
          loanType: loan.loanType,
          requestedAmount: P,
          tenureMonths: n,
          monthlyRepayment: Number(computedMonthly.toFixed(2)),
          interestRate: Number(loan.interestRate ?? 0),
          totalRepayable: Number((computedMonthly * n).toFixed(2)),
          purpose: loan.purpose,
          createdAt: loan.createdAt,
          currency: loan.company?.baseCurrency || 'NGN',
          companyName: (loan.company as any)?.companyName || '',
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
    console.error('[Guarantor GET]', error)
    return withCors(handleApiError(error), origin)
  }
}

// POST /api/staff-loans-benefits/loan-requests/guarantor — submit guarantor decision
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const body = await request.json()
    const token = String(body.token || '').trim()
    const decision = String(body.decision || '').toUpperCase().trim()
    const declineReason = String(body.declineReason || '').trim()

    if (!token) {
      return withCors(ApiResponse.error('Token is required', 400), origin)
    }
    if (!['ACCEPT', 'DECLINE'].includes(decision)) {
      return withCors(ApiResponse.error('decision must be ACCEPT or DECLINE', 400), origin)
    }
    if (decision === 'DECLINE' && !declineReason) {
      return withCors(ApiResponse.error('Please provide a reason for declining', 400), origin)
    }

    const decoded = verifyGuarantorToken(token)
    if (!decoded) {
      return withCors(ApiResponse.error('Invalid or expired link', 401), origin)
    }

    const loan = await prisma.loanRequest.findUnique({
      where: { id: decoded.loanRequestId },
      select: {
        id: true,
        companyId: true,
        staffId: true,
        loanType: true,
        requestedAmount: true,
        tenureMonths: true,
        monthlyRepayment: true,
        guarantorStaffId: true,
        guarantorStatus: true,
        guarantorToken: true,
        guarantorTokenExpiry: true,
        staff: { select: { firstName: true, lastName: true, email: true } },
        company: { select: { baseCurrency: true } },
      },
    })

    if (!loan) {
      return withCors(ApiResponse.error('Loan request not found', 404), origin)
    }

    if (loan.guarantorToken !== token) {
      return withCors(ApiResponse.error('This link has already been used or is no longer valid', 401), origin)
    }

    if (loan.guarantorStaffId !== decoded.guarantorStaffId) {
      return withCors(ApiResponse.error('Invalid guarantor token', 401), origin)
    }

    if (loan.guarantorTokenExpiry && loan.guarantorTokenExpiry < new Date()) {
      return withCors(ApiResponse.error('This link has expired. Please contact HR.', 401), origin)
    }

    if (loan.guarantorStatus !== 'PENDING') {
      return withCors(
        ApiResponse.error(`You have already responded to this request (${loan.guarantorStatus})`, 400),
        origin
      )
    }

    const newStatus = decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED'

    // Fetch guarantor name for notifications
    const guarantorRecord = await prisma.staffRecord.findUnique({
      where: { id: decoded.guarantorStaffId },
      select: { firstName: true, lastName: true },
    })
    const guarantorName = guarantorRecord
      ? `${guarantorRecord.firstName} ${guarantorRecord.lastName}`.trim()
      : 'Your guarantor'

    // Update loan: record decision, clear token
    await prisma.loanRequest.update({
      where: { id: loan.id },
      data: {
        guarantorStatus: newStatus,
        guarantorRespondedAt: new Date(),
        guarantorDeclineReason: decision === 'DECLINE' ? declineReason : null,
        guarantorToken: null,
        guarantorTokenExpiry: null,
      },
    })

    const applicantName = `${loan.staff.firstName} ${loan.staff.lastName}`.trim()
    const currency = loan.company?.baseCurrency || 'NGN'
    const amount = Number(loan.requestedAmount)
    const notificationType = newStatus === 'ACCEPTED' ? 'LOAN_GUARANTOR_ACCEPTED' : 'LOAN_GUARANTOR_DECLINED'

    // Notify applicant (in-app)
    createNotification(
      loan.staffId,
      notificationType,
      newStatus === 'ACCEPTED' ? 'Guarantor Accepted' : 'Guarantor Declined',
      newStatus === 'ACCEPTED'
        ? `${guarantorName} has accepted to be your guarantor for your ${loan.loanType}. Your application can now be reviewed for approval.`
        : `${guarantorName} has declined your guarantor request for your ${loan.loanType}. Please update your application.`,
      { loanRequestId: loan.id, guarantorName, decision: newStatus },
      loan.companyId
    ).catch(err => console.error('[Guarantor response notification error]', err))

    // Email applicant (fire-and-forget)
    sendGuarantorResponseEmail({
      applicantEmail: loan.staff.email,
      applicantName,
      guarantorName,
      loanType: loan.loanType,
      amount,
      decision: newStatus as 'ACCEPTED' | 'DECLINED',
      declineReason: decision === 'DECLINE' ? declineReason : undefined,
      currency,
    }).catch(err => console.error('[Guarantor response email error]', err))

    return withCors(
      ApiResponse.success(
        { decision: newStatus },
        newStatus === 'ACCEPTED'
          ? 'Thank you! You have accepted the guarantor request. The applicant has been notified.'
          : 'You have declined the guarantor request. The applicant has been notified.'
      ),
      origin
    )
  } catch (error) {
    console.error('[Guarantor POST]', error)
    return withCors(handleApiError(error), origin)
  }
}
