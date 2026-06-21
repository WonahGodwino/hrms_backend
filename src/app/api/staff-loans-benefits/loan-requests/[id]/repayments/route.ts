import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { extractBearerToken, resolveScopedCompanyIds } from '@/app/api/staff-loans-benefits/_helpers'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const origin = request.headers.get('origin')
  try {
    const token = extractBearerToken(request.headers.get('authorization'))
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'STAFF'])

    const loanRequestId = params.id
    if (!loanRequestId) return withCors(ApiResponse.error('Loan request ID is required', 400), origin)

    const loanRequest = await prisma.loanRequest.findUnique({
      where: { id: loanRequestId },
      select: {
        id: true,
        companyId: true,
        staffId: true,
        approvedAt: true,
        createdAt: true,
        tenureMonths: true,
        status: true,
        expectedRepaymentDate: true,
      },
    })

    if (!loanRequest) return withCors(ApiResponse.error('Loan request not found', 404), origin)

    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (!scopedCompanyIds.includes(loanRequest.companyId)) {
      return withCors(ApiResponse.error('Access denied', 403), origin)
    }

    // STAFF role may only view their own loan's repayment history
    if (user.role === 'STAFF') {
      const staffRecord = await prisma.staffRecord.findFirst({
        where: { email: user.email, isActive: true },
        select: { id: true },
      })
      if (!staffRecord || staffRecord.id !== loanRequest.staffId) {
        return withCors(ApiResponse.error('Access denied', 403), origin)
      }
    }

    // Deductions are linked to a PayPeriod — fetch all LOAN/ADVANCE deductions
    // for this staff member starting from the loan approval month.
    const repaymentStartDate = loanRequest.approvedAt || loanRequest.createdAt

    const deductionEntries = await prisma.deductionEntry.findMany({
      where: {
        staffId: loanRequest.staffId,
        companyId: loanRequest.companyId,
        deductionType: { in: ['LOAN', 'SALARY_ADVANCE'] },
        payPeriod: {
          // PayPeriod.startDate on or after the month the loan was approved
          startDate: { gte: repaymentStartDate },
        },
      },
      include: {
        payPeriod: {
          select: { month: true, year: true, startDate: true },
        },
      },
    })

    // Deduplicate by month+year (multiple entries in same period are summed)
    const periodMap = new Map<string, { month: number; year: number; amount: number }>()
    for (const entry of deductionEntries) {
      const key = `${entry.payPeriod.year}-${entry.payPeriod.month}`
      const existing = periodMap.get(key)
      if (existing) {
        existing.amount += Number(entry.amount)
      } else {
        periodMap.set(key, {
          month: entry.payPeriod.month,
          year: entry.payPeriod.year,
          amount: Number(entry.amount),
        })
      }
    }

    const paidPeriods = Array.from(periodMap.values()).sort(
      (a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month
    )

    return withCors(
      ApiResponse.success({ paidPeriods }, 'Repayment history fetched successfully'),
      origin
    )
  } catch (err) {
    return withCors(handleApiError(err), origin)
  }
}
