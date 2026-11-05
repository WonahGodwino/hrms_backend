// src/app/api/staff/[id]/loans-benefits/route.ts
//
// One employee's loans + benefits — powers the Employee 360 Loans and
// Benefits tabs. Neither LoanRequest nor BenefitAllocation had a
// single-employee read route before this; both models already carry
// everything needed (remainingBalance/monthlyRepayment/status for loans,
// allocationAmount/status for benefits).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { validateCompanyAccess } from '@/app/lib/departments/department-utils'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN'])

    const staffRecord = await prisma.staffRecord.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true }
    })
    if (!staffRecord) {
      return withCors(ApiResponse.error('Staff record not found', 404), origin)
    }

    const hasAccess = await validateCompanyAccess(user, staffRecord.companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const [loans, benefits, claims] = await Promise.all([
      prisma.loanRequest.findMany({
        where: { staffId: staffRecord.id, companyId: staffRecord.companyId },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.benefitAllocation.findMany({
        where: { staffId: staffRecord.id, companyId: staffRecord.companyId },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.benefitClaim.findMany({
        where: { staffId: staffRecord.id, companyId: staffRecord.companyId },
        orderBy: { createdAt: 'desc' }
      })
    ])

    return withCors(
      ApiResponse.success({
        // NOTE: as of the Staff Loans & Benefits rebuild, LoanRequestStatus
        // values are PENDING_GUARANTOR/PENDING_APPROVAL/APPROVED/REJECTED/
        // DISBURSED/REPAID/DEFAULTED/CANCELLED (previously just PENDING),
        // and BenefitAllocationStatus values are ACTIVE/EXHAUSTED/EXPIRED/
        // CANCELLED/SUSPENDED (previously a shared PENDING/APPROVED/
        // REJECTED/ALLOCATED/COMPLETED/CANCELLED enum) — any frontend status
        // → color/label mapping keyed on the old strings needs updating
        // alongside this route.
        loans: loans.map((l) => ({
          id: l.id,
          loanType: l.loanType,
          requestedAmount: Number(l.requestedAmount),
          approvedAmount: l.approvedAmount ? Number(l.approvedAmount) : null,
          status: l.status,
          monthlyRepayment: l.monthlyRepayment ? Number(l.monthlyRepayment) : null,
          remainingBalance: l.remainingBalance ? Number(l.remainingBalance) : null,
          disbursedAt: l.disbursedAt,
          expectedRepaymentDate: l.expectedRepaymentDate,
          createdAt: l.createdAt
        })),
        benefits: benefits.map((b) => ({
          id: b.id,
          benefitName: b.benefitName,
          allocationAmount: Number(b.allocationAmount),
          status: b.status,
          note: b.note,
          createdAt: b.createdAt
        })),
        benefitClaims: claims.map((c) => ({
          id: c.id,
          benefitName: c.benefitName,
          amount: Number(c.amount),
          status: c.status,
          expenseDate: c.expenseDate,
          paidAt: c.paidAt,
          createdAt: c.createdAt
        }))
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
