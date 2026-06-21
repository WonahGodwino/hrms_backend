import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveScopedCompanyIds } from '../../_helpers'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// Returns the sum of take-home (net) salary from the most recent processed payroll month.
// If the staff member has multiple payroll rows in the same month, they are summed.
async function getStaffNetSalary(staffId: string): Promise<number> {
  const latestPeriod = await prisma.payroll.findFirst({
    where: { staffRecordId: staffId, status: 'PROCESSED' },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    select: { year: true, month: true },
  })

  if (!latestPeriod) return 0

  const records = await prisma.payroll.findMany({
    where: {
      staffRecordId: staffId,
      status: 'PROCESSED',
      year: latestPeriod.year,
      month: latestPeriod.month,
    },
    select: {
      netSalary: true,
      grossPay: true,
      deductions: true,
      payee: true,
      pensionDeduction: true,
      customFields: true,
      templateType: true,
    },
  })

  let totalNet = 0
  for (const p of records) {
    if (p.templateType && p.templateType !== 'ISURF_STANDARD' && p.customFields) {
      // Custom template — look for net/take-home in customFields first
      const cf = p.customFields as Record<string, any>
      let customNet = 0
      for (const key of Object.keys(cf)) {
        const field = cf[key]
        if (field && typeof field === 'object' && 'value' in field) {
          const val = Number(field.value)
          if (
            !isNaN(val) &&
            val > 0 &&
            (field.section === 'NET' ||
              key === 'net_salary' ||
              key === 'take_home' ||
              key === 'net_pay' ||
              key.includes('net_salary') ||
              key.includes('take_home'))
          ) {
            customNet = val
            break
          }
        }
      }
      // Fall back to the standard netSalary column if the custom field wasn't found
      totalNet += customNet || Number(p.netSalary || 0)
    } else {
      totalNet += Number(p.netSalary || 0)
    }
  }

  return totalNet
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'STAFF'])

    const { searchParams } = new URL(request.url)
    const requestedCompanyId = searchParams.get('companyId')
    const showInactive = searchParams.get('showInactive') === 'true'

    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (scopedCompanyIds.length === 0) return withCors(ApiResponse.success([], 'No company access'), origin)

    let companyFilter = scopedCompanyIds
    if (requestedCompanyId && scopedCompanyIds.includes(requestedCompanyId)) {
      companyFilter = [requestedCompanyId]
    }

    const where: any = { companyId: { in: companyFilter } }
    // Non-admin roles only see active policies unless showInactive is explicitly requested
    if (!showInactive && !['ADMIN', 'SUPER_ADMIN', 'HR'].includes(user.role)) {
      where.isActive = true
    }

    const policies = await prisma.loanPolicy.findMany({ where, orderBy: { name: 'asc' } })

    // ── Eligibility computation for the requesting user ──
    // Applies to ALL roles. Each user sees their own eligibility against the
    // company policies returned.  SUPER_ADMINs without a staff record get no
    // eligibility data (admin-only scenario).
    let eligibilityData: {
      netSalary: number
      monthsEmployed: number
      monthlyDebtPayment: number
    } | null = null

    const staffRecord = await prisma.staffRecord.findFirst({
      where: { email: user.email, isActive: true },
      select: { id: true, companyId: true, createdAt: true },
    })

    if (staffRecord) {
      const netSalary = await getStaffNetSalary(staffRecord.id)

      const monthsEmployed = Math.floor(
        (Date.now() - new Date(staffRecord.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
      )

      // Sum all active loan/advance deduction entries for this staff member
      const activeDeductions = await prisma.deductionEntry.aggregate({
        where: {
          staffId: staffRecord.id,
          deductionType: { in: ['LOAN', 'SALARY_ADVANCE'] },
        },
        _sum: { amount: true },
      })
      const monthlyDebtPayment = Number(activeDeductions._sum.amount || 0)

      eligibilityData = { netSalary, monthsEmployed, monthlyDebtPayment }
    }

    const result = policies.map((policy) => {
      const item: any = { ...policy }

      if (!eligibilityData) return item // no staff record — return policy as-is

      const { netSalary, monthsEmployed, monthlyDebtPayment } = eligibilityData

      if (netSalary <= 0) {
        // Staff record exists but no processed payroll found
        item.isEligible = false
        item.eligibilityReason = 'No salary data found. Please contact HR.'
        item.maxBorrowable = 0
        return item
      }

      // Tenure gate
      item.isEligible = monthsEmployed >= (policy.minServiceMonths ?? 0)

      // Max borrowable = min(netSalary × multiplier, policy hard cap)
      const maxBySalary = Math.round(netSalary * (policy.salaryMultiplier ?? 1))
      item.maxBorrowable = Math.min(maxBySalary, policy.maxAmount ?? maxBySalary)

      // Debt-to-income ratio check using the max borrowable as the projected amount
      const monthlyRate = (policy.interestRatePercent ?? 0) / 100 / 12
      const n = policy.maxDurationMonths ?? 12
      const newMonthlyPayment =
        monthlyRate > 0
          ? (item.maxBorrowable * monthlyRate * Math.pow(1 + monthlyRate, n)) /
            (Math.pow(1 + monthlyRate, n) - 1)
          : item.maxBorrowable / n

      const totalDebtRatio = ((monthlyDebtPayment + newMonthlyPayment) / netSalary) * 100

      if (totalDebtRatio > (policy.maxDebtRatioPercent ?? 100)) {
        item.isEligible = false
        item.eligibilityReason = `Debt-to-income ratio (${totalDebtRatio.toFixed(0)}%) exceeds the maximum allowed (${policy.maxDebtRatioPercent}%)`
      } else if (!item.isEligible) {
        item.eligibilityReason = `Requires ${policy.minServiceMonths} months of service (you have ${monthsEmployed})`
      }

      return item
    })

    return withCors(ApiResponse.success(result, 'Loan policies fetched successfully'), origin)
  } catch (err) {
    return withCors(handleApiError(err), origin)
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const body = await request.json()
    const {
      companyId,
      name,
      interestRatePercent,
      maxDurationMonths,
      maxAmount,
      minServiceMonths,
      maxDebtRatioPercent,
      requiresGuarantor,
      guarantorThresholdAmount,
      guarantorMustBeActiveInCompany,
      guarantorMustNotHaveActiveLoan,
      salaryMultiplier,
      isActive,
      rules,
    } = body

    if (!companyId || !name) {
      return withCors(ApiResponse.error('companyId and name are required', 400), origin)
    }

    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (!scopedCompanyIds.includes(companyId)) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const policy = await prisma.loanPolicy.create({
      data: {
        companyId,
        name,
        interestRatePercent: interestRatePercent ?? 5,
        maxDurationMonths: maxDurationMonths ?? 12,
        maxAmount: maxAmount ?? 500000,
        minServiceMonths: minServiceMonths ?? 3,
        maxDebtRatioPercent: maxDebtRatioPercent ?? 40,
        requiresGuarantor: requiresGuarantor ?? false,
        guarantorThresholdAmount: guarantorThresholdAmount ?? null,
        guarantorMustBeActiveInCompany: guarantorMustBeActiveInCompany ?? true,
        guarantorMustNotHaveActiveLoan: guarantorMustNotHaveActiveLoan ?? false,
        salaryMultiplier: salaryMultiplier ?? 1.0,
        isActive: isActive ?? true,
        rules: rules ?? null,
      },
    })

    return withCors(ApiResponse.success(policy, 'Loan policy created successfully'), origin)
  } catch (err) {
    return withCors(handleApiError(err), origin)
  }
}

export async function PUT(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) return withCors(ApiResponse.error('Policy id is required', 400), origin)

    const existing = await prisma.loanPolicy.findUnique({ where: { id } })
    if (!existing) return withCors(ApiResponse.error('Loan policy not found', 404), origin)

    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (!scopedCompanyIds.includes(existing.companyId)) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const cleanUpdates: any = { ...updates }
    const nullableNumericFields = ['guarantorThresholdAmount', 'maxAmount', 'minServiceMonths']
    for (const field of nullableNumericFields) {
      if (cleanUpdates[field] === '' || cleanUpdates[field] === undefined) {
        cleanUpdates[field] = null
      } else if (typeof cleanUpdates[field] === 'string') {
        const num = parseFloat(cleanUpdates[field])
        cleanUpdates[field] = isNaN(num) ? null : num
      }
    }

    const policy = await prisma.loanPolicy.update({ where: { id }, data: cleanUpdates })

    return withCors(ApiResponse.success(policy, 'Loan policy updated successfully'), origin)
  } catch (err) {
    return withCors(handleApiError(err), origin)
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return withCors(ApiResponse.error('Policy id is required', 400), origin)

    const existing = await prisma.loanPolicy.findUnique({ where: { id } })
    if (!existing) return withCors(ApiResponse.error('Loan policy not found', 404), origin)

    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (!scopedCompanyIds.includes(existing.companyId)) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    await prisma.loanPolicy.delete({ where: { id } })

    return withCors(ApiResponse.success(null, 'Loan policy deleted successfully'), origin)
  } catch (err) {
    return withCors(handleApiError(err), origin)
  }
}
