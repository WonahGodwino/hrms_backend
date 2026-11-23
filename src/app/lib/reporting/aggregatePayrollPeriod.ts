// src/app/lib/reporting/aggregatePayrollPeriod.ts
//
// Shared payroll aggregation core, extracted from salary-summary/route.ts so
// both that route and the newer payroll-changes/route.ts (period-over-period
// comparisons) run the exact same logic and can never silently disagree on
// figures. Output shape is byte-identical to what salary-summary/route.ts
// built inline before this extraction.
import { prisma } from '@/app/lib/db'
import type { CustomFieldValue } from '@/app/lib/payroll/templates/types'
import { getPayslipDisplayFields, calculateTotals } from '@/app/lib/payroll/utils'

import {
  getMonthNumber,
  getPeriodMonthCandidates,
  getQuarterRange,
  type SalarySummaryPeriod
} from '@/app/api/admin/dashboard/reporting/salary-summary/period-filter'
import { toNumber } from '@/app/lib/payroll/reports/bank-schedule'

export type AggregatedSalaryRow = {
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
  itf: number
  nhf: number
  medicalContribution: number
}

type StaffMeta = {
  departmentId: string | null
  designationId: string | null
  bankName: string | null
  accountNumber: string | null
}



export function sumByLabel(items: Array<{ label: string; value: number }>, regex: RegExp): number {
  return items
    .filter((item) => regex.test(item.label))
    .reduce((sum, item) => sum + toNumber(item.value), 0)
}

export function toCustomFieldsMap(value: unknown): Record<string, CustomFieldValue> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, CustomFieldValue>
}

export type AggregatePayrollPeriodParams = {
  targetCompanyIds: string[]
  year: number
  period: SalarySummaryPeriod
  month: number
  quarter: number
  staffRecordId?: string | null
}

// Only the columns the aggregation reads. This MUST stay a `select`, never an
// `include`: an `include` pulls every Payslip scalar, including `fileData` —
// the stored PDF — so a yearly report across all companies streamed gigabytes
// of PDFs out of Postgres (Reports Hub 504s).
const PAYSLIP_AGGREGATE_SELECT = {
  staffRecordId: true,
  month: true,
  year: true,
  grossPay: true,
  netPay: true,
  staffRecord: {
    select: {
      id: true,
      staffId: true,
      firstName: true,
      lastName: true,
      department: true,
      departmentId: true,
      position: true,
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
      itf: true,
      nhf: true,
      medicalContribution: true
    }
  }
} as const

export type PayrollAggregatePayslip = Awaited<ReturnType<typeof fetchPayrollPayslips>>[number]

/** Loads the payslips a payroll aggregate is built from (no PDF data). */
export async function fetchPayrollPayslips(params: AggregatePayrollPeriodParams) {
  const { targetCompanyIds, year, period, month, quarter, staffRecordId } = params
  const periodMonthCandidates = getPeriodMonthCandidates(period, month, quarter)

  return prisma.payslip.findMany({
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
      // This aggregate already keeps only one payslip per staff/month
      // (monthStaffDedup below) — once a staff has separate Salary/TA/Bonus
      // rows for a month, only Salary should be the one that wins that
      // dedup, not whichever upload happened to run most recently.
      OR: [{ payslipCategory: null }, { payslipCategory: 'SALARY' }],
    },
    select: PAYSLIP_AGGREGATE_SELECT,
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }]
  })
}

export async function aggregatePayrollPeriod(params: AggregatePayrollPeriodParams) {
  return buildPayrollAggregate(await fetchPayrollPayslips(params), params)
}

/**
 * Builds the aggregate from already-loaded payslips. `payslips` may cover a
 * wider range than `params` (e.g. a whole year when only one month is asked
 * for); rows outside the requested period are skipped below. Lets the Reports
 * Hub load a year once and derive both the period figures and the trend.
 */
export async function buildPayrollAggregate(payslips: PayrollAggregatePayslip[], params: AggregatePayrollPeriodParams) {
  const { period, month, quarter } = params
  const quarterRange = getQuarterRange(quarter)

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
      itf: toNumber(payslip.payroll?.itf),
      nhf: toNumber(payslip.payroll?.nhf),
      medicalContribution: toNumber(payslip.payroll?.medicalContribution)
    })

    if (!staffMetaMap.has(payslip.staffRecordId)) {
      staffMetaMap.set(payslip.staffRecordId, {
        departmentId: payslip.staffRecord?.departmentId || null,
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
      paidMonths: [] as string[],
      totalBasePay: 0,
      totalGrossPay: 0,
      totalNetSalary: 0,
      totalTax: 0,
      totalPension: 0,
      totalBonus: 0
    }

    staffEntry.monthsPaid += 1
    const paidLabel = `${row.month} ${row.year}`
    if (!staffEntry.paidMonths.includes(paidLabel)) staffEntry.paidMonths.push(paidLabel)
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

  // Department/business-unit/designation breakdowns — none of these
  // dimensions live on Payroll directly, only on StaffRecord, so resolve
  // them via a small batch of lookups against the distinct ids collected
  // while building `rows` above, then aggregate in memory alongside the
  // per-month/per-staff totals rather than re-querying Payroll per group.
  const departmentIds = Array.from(new Set(Array.from(staffMetaMap.values()).map((m) => m.departmentId).filter(Boolean))) as string[]
  const designationIds = Array.from(new Set(Array.from(staffMetaMap.values()).map((m) => m.designationId).filter(Boolean))) as string[]

  const [departments, designations] = await Promise.all([
    departmentIds.length
      ? prisma.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true, name: true, businessUnit: true } })
      : Promise.resolve([]),
    designationIds.length
      ? prisma.designation.findMany({ where: { id: { in: designationIds } }, select: { id: true, title: true } })
      : Promise.resolve([])
  ])

  const departmentById = new Map(departments.map((d) => [d.id, d]))
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
  const byDesignationMap = new Map<string, any>()

  for (const row of rows) {
    const meta = staffMetaMap.get(row.staffRecordId)
    const department = meta?.departmentId ? departmentById.get(meta.departmentId) : null
    accumulateBreakdown(byDepartmentMap, department?.name || row.department || 'Unassigned', row)
    accumulateBreakdown(byBusinessUnitMap, department?.businessUnit || 'Unassigned', row)
    accumulateBreakdown(byDesignationMap, (meta?.designationId && designationTitleById.get(meta.designationId)) || row.position || 'Unassigned', row)
  }

  const finalizeBreakdown = (map: Map<string, any>) =>
    Array.from(map.values())
      .map(({ staffIds, ...rest }) => ({ ...rest, staffCount: staffIds.size }))
      .sort((a, b) => b.totalGrossPay - a.totalGrossPay)

  const breakdowns = {
    byDepartment: finalizeBreakdown(byDepartmentMap),
    byBusinessUnit: finalizeBreakdown(byBusinessUnitMap),
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
      acc.itf += row.itf
      acc.nhf += row.nhf
      acc.medicalContribution += row.medicalContribution
      return acc
    },
    { paye: 0, pensionEmployee: 0, pensionEmployer: 0, nsitf: 0, itf: 0, nhf: 0, medicalContribution: 0 }
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

  return { rows, perMonth, perStaff, breakdowns, statutory, bankSchedule, summary }
}
