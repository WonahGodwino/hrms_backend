import { NextRequest } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { getCurrencySymbol, normalizeCurrencyCode } from '@/app/lib/currency'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import type { CustomFieldValue } from '@/app/lib/payroll/templates/types'
import { getPayslipDisplayFields, calculateTotals } from '@/app/lib/payroll/utils'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

import { getPeriodMonthCandidates, type SalarySummaryPeriod } from './period-filter'

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
  employerPension: number
  nsitf: number
  medicalContribution: number
}

type StaffMeta = {
  departmentId: string | null
  currentGradeId: string | null
  designationId: string | null
  bankName: string | null
  accountNumber: string | null
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
    const period = (searchParams.get('period') || 'monthly').toLowerCase() as SalarySummaryPeriod
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

    if (!Number.isInteger(year) || year < 1900 || year > 3000) {
      return withCors(ApiResponse.error('Year must be a valid number', 400), origin)
    }

    if (period === 'monthly' && (!Number.isInteger(month) || month < 1 || month > 12)) {
      return withCors(ApiResponse.error('Month must be between 1 and 12', 400), origin)
    }

    if (period === 'quarterly' && (!Number.isInteger(quarter) || quarter < 1 || quarter > 4)) {
      return withCors(ApiResponse.error('Quarter must be between 1 and 4', 400), origin)
    }

    const accessibleCompanies = await getAccessibleCompanies(user)

    if (accessibleCompanies.length === 0) {
      return withCors(ApiResponse.error('No companies assigned to your account', 403), origin)
    }

    const { targetCompanyIds, resolvedCompanyId, error: accessError } = resolveTargetCompanies(user, companyId, accessibleCompanies)
    if (accessError) return withCors(ApiResponse.error(accessError, 403), origin)

    const quarterRange = getQuarterRange(quarter)
    const periodMonthCandidates = getPeriodMonthCandidates(period, month, quarter)

    const payslips = await prisma.payslip.findMany({
      where: {
        companyId: { in: targetCompanyIds },
        ...(staffRecordId ? { staffRecordId } : {}),
        year,
        ...(period !== 'yearly'
          ? {
              month: {
                in: periodMonthCandidates
              }
            }
          : {}),
      },
      include: {
        staffRecord: {
          select: {
            id: true,
            staffId: true,
            firstName: true,
            lastName: true,
            department: true,
            departmentId: true,
            position: true,
            currentGradeId: true,
            designationId: true,
            bankName: true,
            accountNumber: true
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
            bonusKPI: true,
            employerPension: true,
            nsitf: true,
            medicalContribution: true
          }
        }
      },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }]
    })

    const rows: AggregatedSalaryRow[] = []
    const monthStaffDedup = new Set<string>()
    const staffMetaMap = new Map<string, StaffMeta>()

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
        templateType,
        employerPension: toNumber(payslip.payroll?.employerPension),
        nsitf: toNumber(payslip.payroll?.nsitf),
        medicalContribution: toNumber(payslip.payroll?.medicalContribution)
      })

      if (!staffMetaMap.has(payslip.staffRecordId)) {
        staffMetaMap.set(payslip.staffRecordId, {
          departmentId: payslip.staffRecord?.departmentId || null,
          currentGradeId: payslip.staffRecord?.currentGradeId || null,
          designationId: payslip.staffRecord?.designationId || null,
          bankName: payslip.staffRecord?.bankName || null,
          accountNumber: payslip.staffRecord?.accountNumber || null
        })
      }
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

    // Department/business-unit/grade/designation breakdowns — none of these
    // dimensions live on Payroll directly, only on StaffRecord, so resolve
    // them via a small batch of lookups against the distinct ids collected
    // while building `rows` above, then aggregate in memory alongside the
    // per-month/per-staff totals rather than re-querying Payroll per group.
    const departmentIds = Array.from(new Set(Array.from(staffMetaMap.values()).map((m) => m.departmentId).filter(Boolean))) as string[]
    const gradeIds = Array.from(new Set(Array.from(staffMetaMap.values()).map((m) => m.currentGradeId).filter(Boolean))) as string[]
    const designationIds = Array.from(new Set(Array.from(staffMetaMap.values()).map((m) => m.designationId).filter(Boolean))) as string[]

    const [departments, grades, designations] = await Promise.all([
      departmentIds.length
        ? prisma.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true, name: true, businessUnit: true } })
        : Promise.resolve([]),
      gradeIds.length
        ? (prisma as any).gradeLevel.findMany({ where: { id: { in: gradeIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      designationIds.length
        ? (prisma as any).designation.findMany({ where: { id: { in: designationIds } }, select: { id: true, title: true } })
        : Promise.resolve([])
    ])

    const departmentById = new Map(departments.map((d) => [d.id, d]))
    const gradeNameById = new Map((grades as Array<{ id: string; name: string }>).map((g) => [g.id, g.name]))
    const designationTitleById = new Map((designations as Array<{ id: string; title: string }>).map((d) => [d.id, d.title]))

    function accumulateBreakdown(map: Map<string, any>, key: string, row: AggregatedSalaryRow) {
      if (!key) return
      const entry = map.get(key) || { label: key, staffCount: 0, staffIds: new Set<string>(), totalGrossPay: 0, totalNetSalary: 0, totalTax: 0, totalPension: 0 }
      entry.staffIds.add(row.staffRecordId)
      entry.totalGrossPay += row.grossPay
      entry.totalNetSalary += row.netPay
      entry.totalTax += row.totalTax
      entry.totalPension += row.pension
      map.set(key, entry)
    }

    const byDepartmentMap = new Map<string, any>()
    const byBusinessUnitMap = new Map<string, any>()
    const byGradeMap = new Map<string, any>()
    const byDesignationMap = new Map<string, any>()

    for (const row of rows) {
      const meta = staffMetaMap.get(row.staffRecordId)
      const department = meta?.departmentId ? departmentById.get(meta.departmentId) : null
      accumulateBreakdown(byDepartmentMap, department?.name || row.department || 'Unassigned', row)
      accumulateBreakdown(byBusinessUnitMap, department?.businessUnit || 'Unassigned', row)
      accumulateBreakdown(byGradeMap, (meta?.currentGradeId && gradeNameById.get(meta.currentGradeId)) || 'Ungraded', row)
      accumulateBreakdown(byDesignationMap, (meta?.designationId && designationTitleById.get(meta.designationId)) || row.position || 'Unassigned', row)
    }

    const finalizeBreakdown = (map: Map<string, any>) =>
      Array.from(map.values())
        .map(({ staffIds, ...rest }) => ({ ...rest, staffCount: staffIds.size }))
        .sort((a, b) => b.totalGrossPay - a.totalGrossPay)

    const breakdowns = {
      byDepartment: finalizeBreakdown(byDepartmentMap),
      byBusinessUnit: finalizeBreakdown(byBusinessUnitMap),
      byGrade: finalizeBreakdown(byGradeMap),
      byDesignation: finalizeBreakdown(byDesignationMap)
    }

    // Statutory totals — summed straight from Payroll fields already on
    // `rows`, across the whole filtered period (not per-month/per-staff).
    const statutory = rows.reduce(
      (acc, row) => {
        acc.paye += row.totalTax
        acc.pensionEmployee += row.pension
        acc.pensionEmployer += row.employerPension
        acc.nsitf += row.nsitf
        acc.medicalContribution += row.medicalContribution
        return acc
      },
      { paye: 0, pensionEmployee: 0, pensionEmployer: 0, nsitf: 0, medicalContribution: 0 }
    )

    // Bank payment schedule — one row per staff, net pay totalled across the
    // filtered period, for handing straight to the bank/finance team.
    const bankSchedule = perStaff.map((staff) => {
      const meta = staffMetaMap.get(staff.staffRecordId)
      return {
        staffId: staff.staffId,
        staffName: staff.staffName,
        bankName: meta?.bankName || '',
        accountNumber: meta?.accountNumber || '',
        netSalary: staff.totalNetSalary
      }
    })

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

    let responseCurrency = 'NGN'
    let responseCurrencySymbol: string | null = getCurrencySymbol(responseCurrency)

    if (targetCompanyIds.length === 1) {
      const selectedCompany = await (prisma as any).company.findUnique({
        where: { id: targetCompanyIds[0] },
        select: { baseCurrency: true }
      })
      responseCurrency = normalizeCurrencyCode(selectedCompany?.baseCurrency || 'NGN')
      responseCurrencySymbol = getCurrencySymbol(responseCurrency)
    } else {
      const currencies = await (prisma as any).company.findMany({
        where: { id: { in: targetCompanyIds } },
        select: { baseCurrency: true },
        distinct: ['baseCurrency']
      })
      const unique: string[] = Array.from(
        new Set(
          (currencies as Array<{ baseCurrency?: string }>).map((item) =>
            normalizeCurrencyCode(item.baseCurrency || 'NGN')
          )
        )
      )

      if (unique.length === 1) {
        responseCurrency = unique[0]
        responseCurrencySymbol = getCurrencySymbol(responseCurrency)
      } else {
        responseCurrency = 'MIXED'
        responseCurrencySymbol = null
      }
    }

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
          breakdowns,
          statutory,
          bankSchedule,
          summary,
          metrics: {
            monthsCovered: perMonth.length,
            staffCovered: perStaff.length,
            currency: responseCurrency,
            currencySymbol: responseCurrencySymbol
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
