import { NextRequest } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import type { CustomFieldValue } from '@/app/lib/payroll/templates/types'
import { getPayslipDisplayFields, calculateTotals } from '@/app/lib/payroll/utils'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

type AggregatedSalaryRow = {
  month: string
  year: number
  monthNumber: number
  staffRecordId: string
  staffId: string
  staffName: string
  department: string
  position: string
  basePay: number
  grossPay: number
  netPay: number
  totalTax: number
  pension: number
  bonus: number
  templateType: string
}

type AccessibleCompany = {
  companyId: string
  companyName: string
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    const parsed = Number((value as any).toString())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function sumByLabel(items: Array<{ label: string; value: number }>, regex: RegExp): number {
  return items
    .filter((item) => regex.test(item.label))
    .reduce((sum, item) => sum + toNumber(item.value), 0)
}

function getMonthNumber(month: string): number {
  const normalized = (month || '').trim().toLowerCase()
  const monthMap: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12
  }

  if (monthMap[normalized]) return monthMap[normalized]

  const asNumber = Number(normalized)
  if (Number.isFinite(asNumber) && asNumber >= 1 && asNumber <= 12) {
    return asNumber
  }

  return 0
}

function getQuarterFromMonth(monthNumber: number): number {
  if (monthNumber >= 1 && monthNumber <= 3) return 1
  if (monthNumber >= 4 && monthNumber <= 6) return 2
  if (monthNumber >= 7 && monthNumber <= 9) return 3
  return 4
}

function getQuarterRange(quarter: number): { start: number; end: number } {
  if (quarter === 1) return { start: 1, end: 3 }
  if (quarter === 2) return { start: 4, end: 6 }
  if (quarter === 3) return { start: 7, end: 9 }
  return { start: 10, end: 12 }
}

function toCustomFieldsMap(value: unknown): Record<string, CustomFieldValue> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, CustomFieldValue>
}

async function getAccessibleCompanies(user: any): Promise<AccessibleCompany[]> {
  if (user.role === 'SUPER_ADMIN') {
    const companies = await prisma.company.findMany({
      where: { archived: 0 },
      select: {
        id: true,
        companyName: true
      },
      orderBy: { companyName: 'asc' }
    })
    return companies.map((c) => ({
      companyId: c.id,
      companyName: c.companyName || ''
    }))
  }

  const userCompanies = await prisma.userCompany.findMany({
    where: {
      userId: user.userId,
      company: { archived: 0 }
    },
    select: {
      companyId: true,
      company: {
        select: {
          companyName: true
        }
      }
    },
    orderBy: {
      company: {
        companyName: 'asc'
      }
    }
  })

  const mapped = userCompanies.map((uc) => ({
    companyId: uc.companyId,
    companyName: uc.company?.companyName || ''
  }))
  if (mapped.length > 0) return mapped

  if (!user.companyId) return []

  const fallbackCompany = await prisma.company.findFirst({
    where: {
      id: user.companyId,
      archived: 0
    },
    select: {
      id: true,
      companyName: true
    }
  })

  if (!fallbackCompany) return []

  return [
    {
      companyId: fallbackCompany.id,
      companyName: fallbackCompany.companyName || ''
    }
  ]
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') || 'monthly').toLowerCase()
    const companyId = searchParams.get('companyId')
    const staffRecordId = searchParams.get('staffRecordId')

    const year = Number(searchParams.get('year') || new Date().getFullYear())
    const month = Number(searchParams.get('month') || new Date().getMonth() + 1)
    const quarter = Number(searchParams.get('quarter') || getQuarterFromMonth(month))

    if (!['monthly', 'quarterly', 'yearly'].includes(period)) {
      return withCors(
        ApiResponse.error('Invalid period. Use monthly, quarterly, or yearly', 400),
        origin
      )
    }

    if (period === 'monthly' && (month < 1 || month > 12)) {
      return withCors(ApiResponse.error('Month must be between 1 and 12', 400), origin)
    }

    if (period === 'quarterly' && (quarter < 1 || quarter > 4)) {
      return withCors(ApiResponse.error('Quarter must be between 1 and 4', 400), origin)
    }

    const accessibleCompanies = await getAccessibleCompanies(user)
    const accessibleCompanyIds = accessibleCompanies.map((item) => item.companyId)

    if (accessibleCompanyIds.length === 0) {
      return withCors(ApiResponse.error('No companies assigned to your account', 403), origin)
    }

    let targetCompanyIds: string[] = []
    let resolvedCompanyId: string | null = null

    if (user.role === 'SUPER_ADMIN') {
      targetCompanyIds = accessibleCompanyIds

      if (companyId) {
        if (!accessibleCompanyIds.includes(companyId)) {
          return withCors(ApiResponse.error('Access denied to selected company', 403), origin)
        }
        targetCompanyIds = [companyId]
        resolvedCompanyId = companyId
      }
    } else if (user.role === 'HR') {
      const hrCompanyId = accessibleCompanyIds[0]

      if (companyId && companyId !== hrCompanyId) {
        return withCors(ApiResponse.error('HR can only access their assigned company', 403), origin)
      }

      targetCompanyIds = [hrCompanyId]
      resolvedCompanyId = hrCompanyId
    } else {
      if (companyId) {
        if (!accessibleCompanyIds.includes(companyId)) {
          return withCors(ApiResponse.error('Access denied to selected company', 403), origin)
        }

        targetCompanyIds = [companyId]
        resolvedCompanyId = companyId
      } else {
        // ADMIN default company to support dashboard loading before explicit selection.
        targetCompanyIds = [accessibleCompanyIds[0]]
        resolvedCompanyId = accessibleCompanyIds[0]
      }
    }

    const payslips = await prisma.payslip.findMany({
      where: {
        companyId: { in: targetCompanyIds },
        ...(staffRecordId ? { staffRecordId } : {}),
        year,
      },
      include: {
        staffRecord: {
          select: {
            id: true,
            staffId: true,
            firstName: true,
            lastName: true,
            department: true,
            position: true
          }
        },
        payroll: {
          select: {
            status: true,
            templateType: true,
            customFields: true,
            basicSalary: true,
            grossPay: true,
            netSalary: true,
            payee: true,
            pensionDeduction: true,
            bonusKPI: true
          }
        }
      },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }]
    })

    const quarterRange = getQuarterRange(quarter)
    const rows: AggregatedSalaryRow[] = []
    const monthStaffDedup = new Set<string>()

    for (const payslip of payslips) {
      const monthNumber = getMonthNumber(payslip.month)

      const includeByPeriod =
        period === 'yearly' ||
        (period === 'monthly' && monthNumber === month) ||
        (period === 'quarterly' && monthNumber >= quarterRange.start && monthNumber <= quarterRange.end)

      if (!includeByPeriod) continue

      const payrollStatus = payslip.payroll?.status || ''
      const isPaidMonth = payrollStatus === 'PAID' || payrollStatus === 'PROCESSED' || !payrollStatus
      if (!isPaidMonth) continue

      const dedupKey = `${payslip.staffRecordId}-${payslip.year}-${payslip.month}`
      if (monthStaffDedup.has(dedupKey)) continue
      monthStaffDedup.add(dedupKey)

      const staffName = `${payslip.staffRecord?.firstName || ''} ${payslip.staffRecord?.lastName || ''}`.trim()
      const templateType = payslip.payroll?.templateType || 'STANDARD'

      let basePay = toNumber(payslip.payroll?.basicSalary)
      let grossPay = toNumber(payslip.grossPay) || toNumber(payslip.payroll?.grossPay)
      let netPay = toNumber(payslip.netPay) || toNumber(payslip.payroll?.netSalary)
      let totalTax = toNumber(payslip.payroll?.payee)
      let pension = toNumber(payslip.payroll?.pensionDeduction)
      let bonus = toNumber(payslip.payroll?.bonusKPI)

      const customFields = toCustomFieldsMap(payslip.payroll?.customFields)
      if (templateType === 'DYNAMIC' && customFields) {
        const { earnings, deductions } = getPayslipDisplayFields(customFields)
        const totals = calculateTotals(earnings, deductions)

        const derivedBase = sumByLabel(earnings, /basic\s*salary/i)
        const derivedTax = sumByLabel(deductions, /(paye|tax)/i)
        const derivedPension = sumByLabel(deductions, /pension/i)
        const derivedBonus = sumByLabel(earnings, /bonus/i)

        basePay = basePay || derivedBase
        grossPay = grossPay || totals.grossPay
        netPay = netPay || totals.netPay
        totalTax = totalTax || derivedTax
        pension = pension || derivedPension
        bonus = bonus || derivedBonus
      }

      rows.push({
        month: payslip.month,
        year: payslip.year,
        monthNumber,
        staffRecordId: payslip.staffRecordId,
        staffId: payslip.staffRecord?.staffId || '',
        staffName,
        department: payslip.staffRecord?.department || '',
        position: payslip.staffRecord?.position || '',
        basePay,
        grossPay,
        netPay,
        totalTax,
        pension,
        bonus,
        templateType
      })
    }

    const perMonthMap = new Map<string, any>()
    const perStaffMap = new Map<string, any>()

    for (const row of rows) {
      const monthKey = `${row.year}-${row.month}`
      const monthEntry = perMonthMap.get(monthKey) || {
        month: row.month,
        year: row.year,
        monthNumber: row.monthNumber,
        totalBasePay: 0,
        totalGrossPay: 0,
        totalNetSalary: 0,
        totalTax: 0,
        totalPension: 0,
        totalBonus: 0,
        staffCount: 0
      }

      monthEntry.totalBasePay += row.basePay
      monthEntry.totalGrossPay += row.grossPay
      monthEntry.totalNetSalary += row.netPay
      monthEntry.totalTax += row.totalTax
      monthEntry.totalPension += row.pension
      monthEntry.totalBonus += row.bonus
      monthEntry.staffCount += 1
      perMonthMap.set(monthKey, monthEntry)

      const staffKey = row.staffRecordId
      const staffEntry = perStaffMap.get(staffKey) || {
        staffRecordId: row.staffRecordId,
        staffId: row.staffId,
        staffName: row.staffName,
        department: row.department,
        position: row.position,
        monthsPaid: 0,
        totalBasePay: 0,
        totalGrossPay: 0,
        totalNetSalary: 0,
        totalTax: 0,
        totalPension: 0,
        totalBonus: 0
      }

      staffEntry.monthsPaid += 1
      staffEntry.totalBasePay += row.basePay
      staffEntry.totalGrossPay += row.grossPay
      staffEntry.totalNetSalary += row.netPay
      staffEntry.totalTax += row.totalTax
      staffEntry.totalPension += row.pension
      staffEntry.totalBonus += row.bonus
      perStaffMap.set(staffKey, staffEntry)
    }

    const perMonth = Array.from(perMonthMap.values())
      .sort((a, b) => (a.year === b.year ? a.monthNumber - b.monthNumber : a.year - b.year))
      .map(({ monthNumber, ...rest }) => rest)

    const perStaff = Array.from(perStaffMap.values()).sort((a, b) =>
      a.staffName.localeCompare(b.staffName)
    )

    const summary = perMonth.reduce(
      (acc, row) => {
        acc.totalBasePay += row.totalBasePay
        acc.totalGrossPay += row.totalGrossPay
        acc.totalNetSalary += row.totalNetSalary
        acc.totalTax += row.totalTax
        acc.totalPension += row.totalPension
        acc.totalBonus += row.totalBonus
        return acc
      },
      {
        totalBasePay: 0,
        totalGrossPay: 0,
        totalNetSalary: 0,
        totalTax: 0,
        totalPension: 0,
        totalBonus: 0
      }
    )

    return withCors(
      ApiResponse.success(
        {
          filters: {
            companyId: resolvedCompanyId,
            requestedCompanyId: companyId || null,
            period,
            year,
            month: period === 'monthly' ? month : null,
            quarter: period === 'quarterly' ? quarter : null,
            staffRecordId: staffRecordId || null
          },
          companyContext: {
            role: user.role,
            accessibleCompanies,
            selectedCompanyId: resolvedCompanyId
          },
          perMonth,
          perStaff,
          summary,
          metrics: {
            monthsCovered: perMonth.length,
            staffCovered: perStaff.length,
            currency: 'NGN'
          }
        },
        'Salary summary fetched successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
