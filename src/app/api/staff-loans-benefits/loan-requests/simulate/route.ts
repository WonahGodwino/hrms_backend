// src/app/api/staff-loans-benefits/loan-requests/simulate/route.ts
// Stateless what-if calculator — no DB writes. Powers the ApplyForLoan
// wizard's step 2 and the LoanSimulationDrawer.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess, ALL_ROLES } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { buildInstallmentSchedule, computePlanMonthlyRepayment, computeProcessingFee, computeTotalInterest, computeTotalRepayable, evaluateLoanEligibility, resolveInterestRate } from '@/app/lib/staff-loans-benefits/calculators'
import { resolveExistingMonthlyDebt, resolveMonthsEmployed, resolveStaffGrossSalary, resolveStaffNetSalary } from '@/app/lib/staff-loans-benefits/staff-finance'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ALL_ROLES)

    const body = await request.json()
    const { loanPolicyId, amount, months } = body || {}
    if (!loanPolicyId || !amount || !months) {
      return withCors(ApiResponse.error('loanPolicyId, amount, and months are required', 400), origin)
    }

    const policy = await prisma.loanPolicy.findUnique({ where: { id: loanPolicyId } })
    if (!policy || (user.role !== 'SUPER_ADMIN' && policy.companyId !== user.companyId)) {
      return withCors(ApiResponse.error('Loan policy not found', 404), origin)
    }
    if (months > policy.maxDurationMonths) {
      return withCors(ApiResponse.error(`Duration exceeds this policy's maximum of ${policy.maxDurationMonths} months`, 400), origin)
    }

    // interestRatePercent is a MONTHLY flat rate on principal (1 => 1% of the
    // principal each month — ₦500/mo on ₦50,000). The fee is charged on top
    // and recovered inside the plan, so totalRepayable = principal + interest + fee.
    const interestRatePercent = resolveInterestRate(policy, months)
    const processingFeeAmount = computeProcessingFee(amount, Number(policy.processingFeePercent))
    const monthlyRepayment = computePlanMonthlyRepayment(amount, interestRatePercent, months, processingFeeAmount)
    const totalRepayable = computeTotalRepayable(amount, interestRatePercent, months, processingFeeAmount)

    const [grossSalary, netSalary, monthsEmployed, existingMonthlyDebt] = await Promise.all([
      resolveStaffGrossSalary(user.userId),
      resolveStaffNetSalary(user.userId),
      resolveMonthsEmployed(user.userId),
      resolveExistingMonthlyDebt(user.userId),
    ])

    const eligibility = evaluateLoanEligibility({
      requestedAmount: amount,
      requestedMonthlyRepayment: monthlyRepayment,
      grossSalary,
      netSalary,
      existingMonthlyDebt,
      monthsEmployed,
      policy: {
        minServiceMonths: policy.minServiceMonths,
        maxAmount: Number(policy.maxAmount),
        salaryMultiplier: Number(policy.salaryMultiplier),
        maxDebtRatioPercent: Number(policy.maxDebtRatioPercent),
      },
    })

    const requiresGuarantor =
      policy.requiresGuarantor && (!policy.guarantorThresholdAmount || amount >= Number(policy.guarantorThresholdAmount))

    const simulatedInstallments = buildInstallmentSchedule({
      principal: amount,
      monthlyRatePct: interestRatePercent,
      months,
      startDate: new Date(),
      processingFee: processingFeeAmount,
    })

    // totalDue of the plan's typical (non-final) month — used for the salary
    // impact read, matching what payroll will actually deduct each month.
    const installments = simulatedInstallments

    return withCors(
      ApiResponse.success({
        interestRatePercent,
        monthlyRepayment,
        processingFeeAmount,
        totalInterest: computeTotalInterest(amount, interestRatePercent, months),
        totalRepayable,
        grossSalary,
        netSalary,
        salaryImpactPercent: grossSalary > 0 ? Math.round((monthlyRepayment / grossSalary) * 1000) / 10 : (netSalary > 0 ? Math.round((monthlyRepayment / netSalary) * 1000) / 10 : null),
        requiresGuarantor,
        eligibility,
        installments,
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
