// src/app/api/staff-loans-benefits/activity/route.ts
//
// GET — paginated Recent Activity timeline for one staff member. Merges four
// activity streams into a single newest-first feed:
//   1. Loan repayment installments (PAID) — the moments money actually left,
//      whether via payroll deduction, force recovery or a manual payment
//   2. Loan requests (all statuses) — application, approval, disbursement,
//      rejection, cancellation
//   3. Benefit requests — submitted / approved / rejected
//   4. Benefit allocations (full history) — granted, used up, expired, cancelled
// Cursor-paginated on createdAt so the dashboard's Recent Activity rail can
// "Load more" instead of showing a fixed capped slice.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess, ALL_ROLES } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { checkStaffAccess } from '@/app/lib/staff-access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

type ActivityItem = {
  id: string
  kind: 'LOAN_REPAYMENT' | 'LOAN' | 'BENEFIT' | 'BENEFIT_ALLOCATION'
  title: string
  createdAt: string
  status: string
  amount?: number
  recoveryMethod?: string | null
  loanRequestId?: string
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ALL_ROLES)

    const { searchParams } = new URL(request.url)
    const staffIdParam = searchParams.get('staffId')
    // Viewing another staff member's activity stays role-scoped the same way
    // the dashboard's ?staffId= is (privileged roles + company access).
    const isPrivilegedRole = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(user.role)
    let targetStaffId = user.userId
    if (staffIdParam && isPrivilegedRole) {
      const target = await prisma.staffRecord.findUnique({ where: { id: staffIdParam }, select: { companyId: true } })
      if (!target || !(await checkStaffAccess(user, target.companyId))) {
        return withCors(ApiResponse.error('You do not have access to this staff record', 403), origin)
      }
      targetStaffId = staffIdParam
    }

    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 10, 1), 50)
    const cursorParam = searchParams.get('cursor')
    const cursor = cursorParam ? new Date(cursorParam) : null
    const cursorFilter = cursor && !Number.isNaN(cursor.getTime()) ? { lt: cursor } : undefined

    // Each stream contributes at most `limit` items (a single stream can in
    // theory own every slot on a page, e.g. a staff member repaying monthly
    // for years); the merge below slices the union to `limit`.
    const [loans, paidInstallments, benefitRequests, benefitAllocations] = await Promise.all([
      prisma.loanRequest.findMany({
        where: { staffId: targetStaffId, ...(cursorFilter ? { createdAt: cursorFilter } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, loanType: true, purpose: true, status: true, createdAt: true },
      }),
      prisma.loanInstallment.findMany({
        where: {
          status: 'PAID',
          ...(cursorFilter ? { paidAt: cursorFilter } : {}),
          loanRequest: { staffId: targetStaffId },
        },
        orderBy: { paidAt: 'desc' },
        take: limit,
        select: {
          id: true,
          loanRequestId: true,
          installmentNumber: true,
          totalDue: true,
          amountPaid: true,
          paidAt: true,
          createdAt: true,
          recoveryMethod: true,
          loanRequest: { select: { loanType: true, purpose: true } },
        },
      }),
      prisma.benefitRequest.findMany({
        where: { staffId: targetStaffId, ...(cursorFilter ? { createdAt: cursorFilter } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, benefitName: true, status: true, createdAt: true },
      }),
      prisma.benefitAllocation.findMany({
        where: { staffId: targetStaffId, ...(cursorFilter ? { createdAt: cursorFilter } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, benefitName: true, status: true, createdAt: true },
      }),
    ])

    const items: ActivityItem[] = [
      ...paidInstallments.map((inst) => ({
        id: `installment-${inst.id}`,
        kind: 'LOAN_REPAYMENT' as const,
        title: `Loan repayment — installment ${inst.installmentNumber} (${inst.loanRequest?.loanType || inst.loanRequest?.purpose || 'Loan'})`,
        createdAt: (inst.paidAt || inst.createdAt).toISOString(),
        status: 'PAID',
        amount: Number(inst.amountPaid ?? inst.totalDue ?? 0),
        recoveryMethod: inst.recoveryMethod,
        loanRequestId: inst.loanRequestId,
      })),
      ...loans.map((l) => ({
        id: `loan-${l.id}`,
        kind: 'LOAN' as const,
        title: l.loanType || l.purpose || 'Loan',
        createdAt: l.createdAt.toISOString(),
        status: l.status,
      })),
      ...benefitRequests.map((r) => ({
        id: `benefit-request-${r.id}`,
        kind: 'BENEFIT' as const,
        title: r.benefitName || 'Benefit request',
        createdAt: r.createdAt.toISOString(),
        status: r.status,
      })),
      ...benefitAllocations.map((a) => ({
        id: `benefit-allocation-${a.id}`,
        kind: 'BENEFIT_ALLOCATION' as const,
        title: a.benefitName || 'Benefit allocation',
        createdAt: a.createdAt.toISOString(),
        status: a.status,
      })),
    ]
      .filter((item) => item.createdAt && !Number.isNaN(new Date(item.createdAt).getTime()))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Over-fetch guard: with the cursor strictly below every returned item's
    // timestamp, a page can only contain duplicates if the client passes the
    // same cursor twice — slice defensively anyway.
    const page = items.slice(0, limit)
    // Probe for the next page: an item older than the page's oldest must
    // actually exist for "Load more" to be worth showing, so check rather
    // than infer — this avoids a dangling button when all four streams' takes
    // fit inside one page.
    let moreExists = false
    if (page.length > 0) {
      const oldest = new Date(page[page.length - 1].createdAt)
      const [olderLoan, olderInstallment, olderBenefitRequest, olderAllocation] = await Promise.all([
        prisma.loanRequest.findFirst({ where: { staffId: targetStaffId, createdAt: { lt: oldest } }, select: { id: true } }),
        prisma.loanInstallment.findFirst({ where: { status: 'PAID', paidAt: { lt: oldest }, loanRequest: { staffId: targetStaffId } }, select: { id: true } }),
        prisma.benefitRequest.findFirst({ where: { staffId: targetStaffId, createdAt: { lt: oldest } }, select: { id: true } }),
        prisma.benefitAllocation.findFirst({ where: { staffId: targetStaffId, createdAt: { lt: oldest } }, select: { id: true } }),
      ])
      moreExists = !!(olderLoan || olderInstallment || olderBenefitRequest || olderAllocation)
    }

    return withCors(
      ApiResponse.success({
        items: page,
        hasMore: moreExists,
        nextCursor: page.length > 0 ? page[page.length - 1].createdAt : null,
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
