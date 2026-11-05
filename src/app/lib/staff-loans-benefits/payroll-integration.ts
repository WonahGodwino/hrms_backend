// src/app/lib/staff-loans-benefits/payroll-integration.ts
//
// The Payroll Generation linkage: a disbursed loan's due installment for a
// given month is pulled into that month's Payroll Generation draft as a
// deduction (see field-resolver.ts's LOAN_REPAYMENT_SYSTEM_FIELD), and
// approving that run marks the installment paid. No DeductionEntry writes,
// no bridging to the separate row-based PayPeriod model — installments are
// matched by dueDate falling within the run's target month/year, parsed from
// PayrollGenerationRun.payPeriod (a plain "August 2026" string).
//
// Overpayment protection:
//  - Overdue (MISSED / past-due) installments are collected too, oldest
//    first, so a skipped month is caught up rather than silently lost —
//    the loan still settles at exactly totalRepayable.
//  - Every write clamps at the loan's remainingBalance: the deduction can
//    never exceed what's actually owed, and the final settlement is the
//    exact remaining balance, not the installment's nominal totalDue.
//  - When the balance hits 0 the loan flips to REPAID in the same
//    transaction, so no further deductions can ever be scheduled.
import { prisma } from '@/app/lib/db'

export function parsePayPeriodToMonthRange(payPeriod: string): { start: Date; end: Date } | null {
  const match = payPeriod.match(/^(.+?)\s+(\d{4})$/)
  if (!match) return null
  const [, monthName, yearStr] = match
  const start = new Date(`${monthName} 1, ${yearStr}`)
  if (isNaN(start.getTime())) return null
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

// Shared filter for "installments that still owe money": anything not
// PAID/WAIVED — SCHEDULED/DUE/PARTIALLY_PAID/MISSED all count. MISSED
// installments (past due, skipped) are still owed and get caught up.
function openInstallmentWhere(companyId: string) {
  return {
    companyId,
    status: { notIn: ['PAID', 'WAIVED'] as ('PAID' | 'WAIVED')[] },
    loanRequest: { status: 'DISBURSED' as const, policy: { autoDeductionEnabled: true } },
  }
}

// Batch-fetched once before the per-staff generation loop — one query for
// every staff member in the run, not one query per staff. Returns the amount
// to deduct per staffId for this pay period, already clamped so the staff
// never overpays: overdue installments first, then this month's, capped at
// each loan's remainingBalance.
export async function resolveDueLoanRepayments(params: {
  companyId: string
  staffIds: string[]
  payPeriod: string
}): Promise<Map<string, number>> {
  const range = parsePayPeriodToMonthRange(params.payPeriod)
  const result = new Map<string, number>()
  if (!range || params.staffIds.length === 0) return result

  const installments = await prisma.loanInstallment.findMany({
    where: {
      ...openInstallmentWhere(params.companyId),
      loanRequest: { ...openInstallmentWhere(params.companyId).loanRequest, staffId: { in: params.staffIds } },
    },
    orderBy: { dueDate: 'asc' },
    select: {
      id: true,
      loanRequestId: true,
      dueDate: true,
      totalDue: true,
      amountPaid: true,
      loanRequest: { select: { staffId: true, remainingBalance: true } },
    },
  })

  // Per staff: track remaining allowance per loan so we can clamp.
  const allowanceByStaffLoan = new Map<string, number>() // `${staffId}:${loanRequestId}` -> remainingBalance
  for (const inst of installments) {
    const staffId = inst.loanRequest.staffId
    const key = `${staffId}:${inst.loanRequestId}`
    if (!allowanceByStaffLoan.has(key)) {
      allowanceByStaffLoan.set(key, Number(inst.loanRequest.remainingBalance ?? 0))
    }
    const dueNow = Number(inst.totalDue) - Number(inst.amountPaid)
    if (dueNow <= 0) continue

    // Only THIS month's installment plus anything OVERDUE (older than the
    // period) — future installments stay scheduled, never pulled forward.
    const inPeriod = inst.dueDate >= range.start && inst.dueDate <= range.end
    const isOverdue = inst.dueDate < range.start
    if (!inPeriod && !isOverdue) continue

    let allowance = allowanceByStaffLoan.get(key) ?? 0
    const collect = Math.min(dueNow, allowance)
    if (collect <= 0) continue
    allowance = Math.round((allowance - collect) * 100) / 100
    allowanceByStaffLoan.set(key, allowance)

    result.set(staffId, Math.round(((result.get(staffId) || 0) + collect) * 100) / 100)
  }
  return result
}

// Called once per staff member at the Approve/finalize step (re-derives the
// same due-installments query rather than trusting anything persisted in
// the draft PayrollData row, so it stays correct even if a run was
// regenerated between draft and approval) — marks each collected installment
// paid and decrements the loan's remainingBalance in the same transaction
// that finalizes that staff's payslip.
//
// The final payment is CLAMPED to the loan's remaining balance, so if the
// plan's last installment's nominal totalDue would overshoot (rounding, or
// overdue catch-up), the staff pays exactly the balance — never a kobo more.
// When the balance reaches 0 the loan flips to REPAID.
export async function markDueLoanRepaymentsPaid(params: {
  companyId: string
  staffId: string
  payPeriod: string
  payrollGenerationRunId: string
  recordedBy: string
}): Promise<void> {
  const range = parsePayPeriodToMonthRange(params.payPeriod)
  if (!range) return

  const installments = await prisma.loanInstallment.findMany({
    where: {
      ...openInstallmentWhere(params.companyId),
      dueDate: { lte: range.end },
      loanRequest: { ...openInstallmentWhere(params.companyId).loanRequest, staffId: params.staffId },
    },
    orderBy: { dueDate: 'asc' },
  })

  for (const inst of installments) {
    const loan = await prisma.loanRequest.findUnique({
      where: { id: inst.loanRequestId },
      select: { remainingBalance: true },
    })
    if (!loan) continue
    const remainingBalance = Number(loan.remainingBalance ?? 0)
    if (remainingBalance <= 0) continue

    const dueNow = Number(inst.totalDue) - Number(inst.amountPaid)
    if (dueNow <= 0) continue

    // Clamp: never collect more than the loan still owes.
    const collect = Math.min(dueNow, remainingBalance)
    const newBalance = Math.round((remainingBalance - collect) * 100) / 100
    const installmentSettled = dueNow - collect <= 0
    const fullyPaid = newBalance <= 0 || installmentSettled

    await prisma.$transaction([
      prisma.loanInstallment.update({
        where: { id: inst.id },
        data: {
          amountPaid: Number(inst.amountPaid) + collect,
          status: fullyPaid ? 'PAID' : 'PARTIALLY_PAID',
          paidAt: new Date(),
          recoveryMethod: 'SALARY_DEDUCTION',
          recordedBy: params.recordedBy,
          payrollGenerationRunId: params.payrollGenerationRunId,
        },
      }),
      prisma.loanRequest.update({
        where: { id: inst.loanRequestId },
        data: {
          remainingBalance: Math.max(0, newBalance),
          // Loan settled — flip to REPAID so it leaves every "active" KPI,
          // progress bar reads 100%, and no further deduction is scheduled.
          ...(newBalance <= 0 ? { status: 'REPAID' } : {}),
        },
      }),
    ])
  }
}
