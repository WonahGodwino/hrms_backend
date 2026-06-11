import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveScopedCompanyIds } from '../../_helpers'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])

    const { searchParams } = new URL(request.url)
    const requestedCompanyId = searchParams.get('companyId')
    const showInactive = searchParams.get('showInactive') === 'true'

    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (scopedCompanyIds.length === 0) return withCors(ApiResponse.success([], 'No company access'), origin)

    // Filter to specific company if requested (for SUPER_ADMIN)
    let companyFilter = scopedCompanyIds
    if (requestedCompanyId && scopedCompanyIds.includes(requestedCompanyId)) {
      companyFilter = [requestedCompanyId]
    }

    const where: any = {
      companyId: { in: companyFilter },
    }
    if (!showInactive && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && user.role !== 'HR') {
      where.isActive = true
    }

    const policies = await prisma.loanPolicy.findMany({
      where,
      orderBy: { name: 'asc' },
    })

    // For STAFF — compute eligibility against their salary
    let eligibilityData: any = {}
    if (user.role === 'STAFF') {
      const staffRecord = await prisma.staffRecord.findFirst({
        where: { email: user.email, isActive: true },
        select: { id: true, companyId: true, createdAt: true },
      })
      if (staffRecord) {
        const salary = await prisma.employeeSalary.findFirst({
          where: { staffId: staffRecord.id, isActive: true },
          select: {
            basicSalary: true,
            housingAllowance: true,
            transportAllowance: true,
            dressingAllowance: true,
            leaveAllowance: true,
            entertainmentAllowance: true,
            utilityAllowance: true,
            otherAllowances: true,
          },
        })
        const employeeSalary = salary
          ? Number(salary.basicSalary || 0)
            + Number(salary.housingAllowance || 0)
            + Number(salary.transportAllowance || 0)
            + Number(salary.dressingAllowance || 0)
            + Number(salary.leaveAllowance || 0)
            + Number(salary.entertainmentAllowance || 0)
            + Number(salary.utilityAllowance || 0)
            + Number(salary.otherAllowances || 0)
          : 0
        const monthsEmployed = Math.floor((Date.now() - new Date(staffRecord.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30.44))

        // Check active loan repayment obligations
        const activeDeductions = await prisma.deductionEntry.aggregate({
          where: {
            staffId: staffRecord.id,
            deductionType: { in: ['LOAN', 'SALARY_ADVANCE'] },
          },
          _sum: { amount: true },
        })
        const monthlyDebtPayment = Number(activeDeductions._sum.amount || 0)

        eligibilityData = {
          employeeSalary,
          monthsEmployed,
          monthlyDebtPayment,
        }
      }
    }

    const result = policies.map(policy => {
      const item: any = { ...policy }
      if (user.role === 'STAFF' && eligibilityData.employeeSalary) {
        const ed = eligibilityData
        // Check minimum service months
        item.isEligible = ed.monthsEmployed >= policy.minServiceMonths

        // Calculate max borrowing based on salary * multiplier
        const maxBySalary = Math.round(ed.employeeSalary * policy.salaryMultiplier)
        item.maxBorrowable = Math.min(maxBySalary, policy.maxAmount)

        // Check debt ratio
        const newMonthlyPayment = item.maxBorrowable * (policy.interestRatePercent / 100) / 12 + item.maxBorrowable / policy.maxDurationMonths
        const totalDebtRatio = ((ed.monthlyDebtPayment + newMonthlyPayment) / ed.employeeSalary) * 100
        if (totalDebtRatio > policy.maxDebtRatioPercent) {
          item.isEligible = false
          item.eligibilityReason = `Your current debt-to-income ratio (${totalDebtRatio.toFixed(0)}%) exceeds the maximum allowed (${policy.maxDebtRatioPercent}%)`
        }

        if (!item.isEligible && !item.eligibilityReason) {
          item.eligibilityReason = `Requires ${policy.minServiceMonths} months of service (you have ${ed.monthsEmployed})`
        }
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

    // Verify company access
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

    // Sanitize empty strings → null for nullable numeric fields
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

    const policy = await prisma.loanPolicy.update({
      where: { id },
      data: cleanUpdates,
    })

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