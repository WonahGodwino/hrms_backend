// src/app/api/core-setup/action-items/cross-module/route.ts
//
// GET /api/core-setup/action-items/cross-module?companyId=...
//
// Pending work from the other modules that an HR/Admin should see in the Action Center. Each module is included only when the company
// has it enabled; counts come straight from the owning module's tables.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { hasModuleAccess } from '@/app/lib/module-access'
import { AUTOMATION_DECIDER_ROLES, companyForRequest } from '@/app/lib/core-setup/automation'

type Item = {
  key: string
  module: string
  moduleLabel: string
  title: string
  detail: string
  count: number
  priority: 'high' | 'medium' | 'low'
  openPath: string
  oldestAt: string | null
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = requireRole(authHeader.replace('Bearer ', ''), AUTOMATION_DECIDER_ROLES)

    const scope = await companyForRequest(request, user)
    if ('error' in scope) return withCors(ApiResponse.error(scope.error, scope.status), origin)
    const { companyId } = scope

    const enabled = async (key: string) => user.role === 'SUPER_ADMIN' || (await hasModuleAccess(companyId, key as never))
    const items: Item[] = []
    const add = (i: Omit<Item, 'oldestAt'> & { oldest?: Date | null }) => {
      const { oldest, ...rest } = i
      if (rest.count > 0) items.push({ ...rest, oldestAt: oldest ? oldest.toISOString() : null })
    }

    if (await enabled('LEAVE')) {
      const where = { companyId, status: { in: ['PENDING', 'MANAGER_APPROVED'] } }
      const [count, oldest] = await Promise.all([
        prisma.leaveRequest.count({ where }),
        prisma.leaveRequest.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      ])
      add({ key: 'x-leave', module: 'LEAVE', moduleLabel: 'Leave', title: 'Leave requests awaiting approval', detail: `${count} request(s) are waiting for a decision.`, count, priority: 'high', openPath: '/leave-applications', oldest: oldest?.createdAt })
    }

    if (await enabled('PHED')) {
      const where = { companyId, status: { in: ['PENDING_HR_APPROVAL', 'RETURNED_FOR_CORRECTION'] as never[] } }
      const [count, oldest] = await Promise.all([
        prisma.phedApprovalMemo.count({ where }),
        prisma.phedApprovalMemo.findFirst({ where, orderBy: { stageEnteredAt: 'asc' }, select: { stageEnteredAt: true } }),
      ])
      add({ key: 'x-phed', module: 'PHED', moduleLabel: 'PHED', title: 'Payroll approval memos need HR action', detail: `${count} memo(s) are awaiting HR sign-off or correction.`, count, priority: 'high', openPath: '/phed', oldest: oldest?.stageEnteredAt })
    }

    if (await enabled('STAFF_LOANS_BENEFITS')) {
      const [loans, benefits] = await Promise.all([
        prisma.loanRequest.count({ where: { companyId, status: 'PENDING_APPROVAL' } }),
        prisma.benefitRequest.count({ where: { companyId, status: 'PENDING_APPROVAL' } }),
      ])
      add({ key: 'x-loans', module: 'STAFF_LOANS_BENEFITS', moduleLabel: 'Loans & Benefits', title: 'Loan and benefit requests awaiting approval', detail: `${loans} loan and ${benefits} benefit request(s) are pending.`, count: loans + benefits, priority: 'medium', openPath: '/staff-loans-benefits/approvals' })
    }

    if (await enabled('RECRUITMENT')) {
      const where = { status: 'PENDING' as const, offer: { companyId } }
      const [count, oldest] = await Promise.all([
        prisma.recruitmentOfferApproval.count({ where }),
        prisma.recruitmentOfferApproval.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      ])
      add({ key: 'x-offers', module: 'RECRUITMENT', moduleLabel: 'Recruitment', title: 'Offer approvals pending', detail: `${count} offer approval(s) are waiting on an approver.`, count, priority: 'medium', openPath: '/recruitment/offers', oldest: oldest?.createdAt })
    }

    if (await enabled('ONBOARDING')) {
      const count = await prisma.onboarding.count({ where: { companyId, status: { in: ['NOT_STARTED', 'IN_PROGRESS'] }, archived: 0 } })
      add({ key: 'x-onboarding', module: 'ONBOARDING', moduleLabel: 'Onboarding', title: 'Onboardings in progress', detail: `${count} onboarding(s) are not yet complete.`, count, priority: 'low', openPath: '/onboarding-center' })
    }

    return withCors(ApiResponse.success({ items }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
