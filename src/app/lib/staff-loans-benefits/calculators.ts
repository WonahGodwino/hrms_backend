// src/app/lib/staff-loans-benefits/calculators.ts
// Loan amortization, fee, and installment-schedule math — the one place this
// logic lives, replacing the old module's four slightly-different
// reimplementations of the same formula across its routes.
//
// ─── Interest model ───
// `interestRatePercent` on LoanPolicy is a MONTHLY flat rate on the principal
// (1 in the config means 1% of the principal charged every month — ₦500/mo on
// a ₦50,000 loan). It is NOT an annual reducing-balance rate. Interest each
// month = round2(principal × rate/100), constant across the tenure.
//
// ─── Fee model ───
// The processing fee is charged ON TOP of the principal and is recovered
// through the installment plan (added to month 1) — it is part of
// totalRepayable so the staff never pays more or less than principal +
// interest + fee across the schedule. The disbursed cash stays the principal.

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Monthly flat interest on the original principal. `months` and the rate are
// interpreted per-month, matching the policy config UI ("Interest Rate (%)"
// charged each month of the tenure).
export function computeMonthlyInterest(principal: number, monthlyRatePct: number): number {
  return round2((principal * monthlyRatePct) / 100)
}

export type InstallmentPlan = {
  installmentNumber: number
  dueDate: Date
  principalDue: number
  interestDue: number
  feeDue: number
  totalDue: number
  remainingBalance: number
  isFinal: boolean
}

// Total interest over the tenure, principal is the disbursed principal.
export function computeTotalInterest(principal: number, monthlyRatePct: number, months: number): number {
  return round2(computeMonthlyInterest(principal, monthlyRatePct) * months)
}

// Builds the full installment schedule. `startDate` is the disbursement date —
// the first installment falls one month later.
//
// Over/under-payment guarantee: every installment's totalDue is
// round2((principal/n) + monthlyInterest) except the FINAL installment, which
// is computed as (totalRepayable − sum of all previous installments). The plan
// therefore sums to EXACTLY principal + interest + fee — the staff can never
// overpay (payroll/force-recovery clamp at the remaining balance and the loan
// flips to REPAID the moment the plan is settled) or underpay (every kobo the
// policy charges is inside the plan).
export function buildInstallmentSchedule(params: {
  principal: number
  monthlyRatePct: number
  months: number
  startDate: Date
  processingFee?: number
}): InstallmentPlan[] {
  const { principal, monthlyRatePct, months, startDate } = params
  const processingFee = round2(params.processingFee ?? 0)
  const monthlyInterest = computeMonthlyInterest(principal, monthlyRatePct)

  // Total the staff must repay: principal + interest for every month + fee.
  const totalRepayable = round2(principal + monthlyInterest * months + processingFee)

  // Even share of the principal portion.
  const perMonthPrincipal = months > 0 ? round2(principal / months) : 0

  let allocated = 0 // running total of previous installments' totalDue
  let principalLeft = principal
  const schedule: InstallmentPlan[] = []

  for (let i = 1; i <= months; i++) {
    const isFinal = i === months
    const dueDate = new Date(startDate)
    dueDate.setMonth(dueDate.getMonth() + i)

    let totalDue: number
    if (isFinal) {
      // Final installment = whatever remains of totalRepayable. Guarantees
      // the schedule sums exactly to principal + interest + fee.
      totalDue = round2(totalRepayable - allocated)
    } else {
      totalDue = round2(perMonthPrincipal + monthlyInterest + (i === 1 ? processingFee : 0))
    }
    if (totalDue < 0) totalDue = 0

    // Principal portion of this installment: never more than what's left.
    const interestPortion = round2(monthlyInterest)
    let principalPortion = round2(totalDue - interestPortion - (i === 1 ? processingFee : 0))
    if (principalPortion > principalLeft) principalPortion = principalLeft
    if (principalPortion < 0) principalPortion = 0
    principalLeft = round2(principalLeft - principalPortion)

    const remainingBalance = round2(totalRepayable - allocated - totalDue)
    allocated = round2(allocated + totalDue)

    schedule.push({
      installmentNumber: i,
      dueDate,
      principalDue: principalPortion,
      interestDue: interestPortion,
      feeDue: i === 1 ? processingFee : 0,
      totalDue,
      remainingBalance: Math.max(0, remainingBalance),
      isFinal,
    })
  }

  return schedule
}

// Sum of the plan's totalDue — equals principal + interest + fee by construction.
export function computeTotalRepayable(principal: number, monthlyRatePct: number, months: number, processingFee = 0): number {
  return round2(principal + computeTotalInterest(principal, monthlyRatePct, months) + round2(processingFee))
}

// The plan's typical monthly charge: principal/n + monthly interest, with the
// processing fee folded into month 1. (The final installment absorbs rounding
// drift, so this is exactly what most months deduct.)
export function computePlanMonthlyRepayment(principal: number, monthlyRatePct: number, months: number, processingFee = 0): number {
  if (months <= 0) return 0
  return round2(round2(principal / months) + computeMonthlyInterest(principal, monthlyRatePct) + round2(processingFee))
}

export function computeProcessingFee(principal: number, processingFeePercent: number): number {
  return round2((principal * processingFeePercent) / 100)
}

// Resolves the effective monthly rate for a tenure: the policy may define a
// per-duration matrix (interestByDuration) that overrides the flat rate.
export function resolveInterestRate(policy: { interestRatePercent: unknown; interestByDuration?: any }, months: number): number {
  const matrix = policy.interestByDuration as Record<string, number> | null | undefined
  if (matrix && matrix[String(months)] != null) {
    return Number(matrix[String(months)])
  }
  return Number(policy.interestRatePercent)
}

export type LoanEligibility = {
  isEligible: boolean
  maxBorrowable: number
  reason?: string
}

// Salary-multiplier + debt-ratio eligibility check. `grossSalary` (previous pay-period gross)
// and `existingMonthlyDebt` (sum of other active loans' monthly repayments) are
// resolved by the caller from Payroll/StaffPayrollProfile + LoanRequest data.
export function evaluateLoanEligibility(params: {
  requestedAmount: number
  requestedMonthlyRepayment: number
  grossSalary?: number
  netSalary?: number
  existingMonthlyDebt: number
  monthsEmployed: number
  policy: { minServiceMonths: number; maxAmount: number; salaryMultiplier: number; maxDebtRatioPercent: number }
}): LoanEligibility {
  const { requestedAmount, requestedMonthlyRepayment, grossSalary, netSalary, existingMonthlyDebt, monthsEmployed, policy } = params
  const salary = grossSalary != null ? grossSalary : (netSalary || 0)

  if (monthsEmployed < policy.minServiceMonths) {
    return { isEligible: false, maxBorrowable: 0, reason: `Requires at least ${policy.minServiceMonths} months of service` }
  }

  const maxBorrowable = Math.min(policy.maxAmount, salary * policy.salaryMultiplier)
  if (requestedAmount > maxBorrowable) {
    return { isEligible: false, maxBorrowable, reason: `Amount exceeds the maximum borrowable limit for this policy` }
  }

  const debtRatio = salary > 0 ? ((existingMonthlyDebt + requestedMonthlyRepayment) / salary) * 100 : 100
  if (debtRatio > policy.maxDebtRatioPercent) {
    return { isEligible: false, maxBorrowable, reason: `Monthly repayment would exceed the maximum debt-to-income ratio (${policy.maxDebtRatioPercent}%)` }
  }

  return { isEligible: true, maxBorrowable }
}

// Formats an amount using the given ISO currency code (Company.baseCurrency),
// falling back to plain 2dp formatting if the code isn't a valid ISO 4217
// currency Intl recognizes.
export function formatCurrency(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${currencyCode} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  }
}
