// Pay-period freeze (security control).
//
// Once a payroll has received final approval, the pay period must be frozen so
// no post-approval modification or manipulation is possible. A period is frozen
// when EITHER:
//   - the period itself is APPROVED or PAID (admin final approval), or
//   - its approval memo is APPROVED (MD/CEO final approval).
//
// Every data-mutating endpoint (edit/delete period, compute, validations,
// overtime, revert) must reject a frozen period. Status-advancing actions
// (approve, send payslips) are intentionally NOT frozen so the flow can still
// complete: MD final approval → admin approve → send payslips → PAID.

import { prisma } from '@/app/lib/db'

export type PayPeriodFreezeState = { frozen: boolean; reason?: string }

// Pure predicate — usable in list/detail responses without extra queries.
export function isFrozenStatus(
  status: string | null | undefined,
  memoStatus: string | null | undefined,
): boolean {
  return status === 'APPROVED' || status === 'PAID' || memoStatus === 'APPROVED'
}

export async function getPayPeriodFreezeState(
  payPeriodId: string,
  knownStatus?: string | null,
): Promise<PayPeriodFreezeState> {
  const period = await (prisma as any).phedPayPeriod.findUnique({
    where: { id: payPeriodId },
    select: { status: true },
  })
  const status = period ? (period.status as string) : (knownStatus ?? '')
  if (!period && !knownStatus) return { frozen: false }

  if (status === 'APPROVED' || status === 'PAID') {
    return {
      frozen: true,
      reason: `This pay period is ${status} and is locked against further changes.`,
    }
  }

  const memo = await (prisma as any).phedApprovalMemo.findUnique({
    where: { payPeriodId },
    select: { status: true },
  })
  if (memo?.status === 'APPROVED') {
    return {
      frozen: true,
      reason:
        'This pay period has received final approval (MD/CEO) and is locked against changes.',
    }
  }

  return { frozen: false }
}
