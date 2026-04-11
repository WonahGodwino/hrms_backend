import { NextRequest } from 'next/server'

import { requireAuth } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import type { CustomFieldValue } from '@/app/lib/payroll/templates/types'
import { getPayslipDisplayFields, calculateTotals } from '@/app/lib/payroll/utils'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

type SalaryMonthItem = {
  month: string
  year: number
  monthNumber: number
  basePay: number
  grossPay: number
  netPay: number
  totalTax: number
  pension: number
  bonus: number
  templateType: string
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

function toCustomFieldsMap(value: unknown): Record<string, CustomFieldValue> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, CustomFieldValue>
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
    const user = requireAuth(token)

    if (user.role !== 'STAFF') {
      return withCors(ApiResponse.error('This endpoint is for staff members only', 403), origin)
    }

    if (!user.companyId) {
      return withCors(ApiResponse.error('Company context missing for current user', 400), origin)
    }

    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const fromYearParam = searchParams.get('fromYear')
    const toYearParam = searchParams.get('toYear')

    const year = yearParam ? parseInt(yearParam, 10) : null
    const fromYear = fromYearParam ? parseInt(fromYearParam, 10) : null
    const toYear = toYearParam ? parseInt(toYearParam, 10) : null

    const yearWhere = year
      ? year
      : fromYear || toYear
      ? {
          ...(fromYear ? { gte: fromYear } : {}),
          ...(toYear ? { lte: toYear } : {})
        }
      : undefined

    const payslips = await prisma.payslip.findMany({
      where: {
        companyId: user.companyId as string,
        staffRecordId: user.userId,
        ...(yearWhere !== undefined ? { year: yearWhere } : {})
      },
      include: {
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

    // Use latest payslip per month/year and only include months that are effectively paid.
    const monthMap = new Map<string, SalaryMonthItem>()

    for (const p of payslips) {
      const payrollStatus = p.payroll?.status || ''
      const isPaidMonth = payrollStatus === 'PAID' || payrollStatus === 'PROCESSED' || !payrollStatus
      if (!isPaidMonth) continue

      const key = `${p.year}-${p.month}`
      if (monthMap.has(key)) continue

      const templateType = p.payroll?.templateType || 'STANDARD'

      let basePay = toNumber(p.payroll?.basicSalary)
      let grossPay = toNumber(p.grossPay) || toNumber(p.payroll?.grossPay)
      let netPay = toNumber(p.netPay) || toNumber(p.payroll?.netSalary)
      let totalTax = toNumber(p.payroll?.payee)
      let pension = toNumber(p.payroll?.pensionDeduction)
      let bonus = toNumber(p.payroll?.bonusKPI)

      const customFields = toCustomFieldsMap(p.payroll?.customFields)
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

      monthMap.set(key, {
        month: p.month,
        year: p.year,
        monthNumber: getMonthNumber(p.month),
        basePay,
        grossPay,
        netPay,
        totalTax,
        pension,
        bonus,
        templateType
      })
    }

    const monthly = Array.from(monthMap.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year
      return a.monthNumber - b.monthNumber
    })

    const monthlyOutput = monthly.map(({ monthNumber, ...rest }) => rest)

    const summary = monthlyOutput.reduce(
      (acc, row) => {
        acc.totalGrossPay += row.grossPay
        acc.totalNetSalary += row.netPay
        acc.totalTax += row.totalTax
        return acc
      },
      {
        totalGrossPay: 0,
        totalNetSalary: 0,
        totalTax: 0
      }
    )

    return withCors(
      ApiResponse.success(
        {
          monthly: monthlyOutput,
          summary,
          metrics: {
            monthsPaid: monthlyOutput.length,
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
