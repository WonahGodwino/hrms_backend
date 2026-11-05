// src/app/api/staff-loans-benefits/loan-requests/[id]/route.ts
// GET — full detail for one loan request: installments, guarantor, and
// approval history (from ApprovalActionLog).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess, ALL_ROLES } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { checkStaffAccess } from '@/app/lib/staff-access'

import { buildInstallmentSchedule } from '@/app/lib/staff-loans-benefits/calculators'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ALL_ROLES)

    const loan = await prisma.loanRequest.findUnique({
      where: { id: params.id },
      include: {
        staff: { select: { id: true, firstName: true, lastName: true, email: true, department: true, avatarUrl: true } },
        guarantor: { select: { id: true, firstName: true, lastName: true, email: true } },
        installments: { orderBy: { installmentNumber: 'asc' } },
        policy: { select: { id: true, name: true } },
      },
    })
    if (!loan) return withCors(ApiResponse.error('Loan request not found', 404), origin)

    const isSelf = loan.staffId === user.userId
    if (!isSelf) {
      // Role no longer gates org-wide loan visibility (all roles are module
      // members) — company scoping via checkStaffAccess is the real boundary.
      const hasAccess = await checkStaffAccess(user, loan.companyId)
      if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this loan request', 403), origin)
    }

    const approvalHistory = await prisma.approvalActionLog.findMany({
      where: { requestType: 'LOAN_REQUEST', requestId: loan.id },
      orderBy: { createdAt: 'asc' },
    })

    let projectedInstallments: any[] = []
    if (!loan.installments || loan.installments.length === 0) {
      const principal = Number(loan.approvedAmount ?? loan.requestedAmount ?? 0)
      const annualRatePct = Number(loan.interestRatePercent ?? 0)
      const months = Number(loan.tenureMonths ?? 0)
      const startDate = loan.disbursedAt || loan.createdAt || new Date()

      if (principal > 0 && months > 0) {
        const schedule = buildInstallmentSchedule({
          principal,
          monthlyRatePct: annualRatePct,
          months,
          startDate,
          processingFee: Number(loan.processingFeeAmount ?? 0),
        })
        projectedInstallments = schedule.map((inst) => ({
          id: `proj-${inst.installmentNumber}`,
          loanRequestId: loan.id,
          installmentNumber: inst.installmentNumber,
          dueDate: inst.dueDate,
          principalDue: inst.principalDue,
          interestDue: inst.interestDue,
          totalDue: inst.totalDue,
          amountPaid: 0,
          status: 'PENDING',
          remainingBalance: inst.remainingBalance,
          isProjected: true,
        }))
      }
    }

    return withCors(ApiResponse.success({ ...loan, approvalHistory, projectedInstallments }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
