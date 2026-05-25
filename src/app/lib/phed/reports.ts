// ============================================================
// PHED Module – Report Generators
// Returns plain JSON arrays; route handlers format/stream them.
// ============================================================

import type {
  PhedComputedPayroll as PrismaPayroll,
} from '@prisma/client'
import type {
  BankScheduleRow,
  PensionScheduleRow,
  PAYEScheduleRow,
  StatutoryScheduleRow,
  CostCentreRow,
  WithheldRow,
} from './types'

type Payroll = PrismaPayroll

// ── Bank Schedule ────────────────────────────────────────────

export function buildBankSchedule(rows: Payroll[]): BankScheduleRow[] {
  return rows
    .filter(r => r.paymentStatus === 'ACTIVE')
    .map((r, i) => ({
      sn:            i + 1,
      staffId:       r.staffIdCode ?? '',
      staffName:     r.staffName   ?? '',
      bankName:      r.bankName    ?? '',
      accountNumber: r.accountNumber ?? '',
      accountName:   r.accountName   ?? '',
      netSalary:     toNum(r.netSalary),
      department:    r.department  ?? '',
      region:        r.regionName  ?? '',
    }))
}

// ── Withheld Salaries ────────────────────────────────────────

export function buildWithheldReport(
  rows: Payroll[],
  validationReasons?: Map<string, string | null>
): WithheldRow[] {
  return rows
    .filter(r => r.paymentStatus === 'WITHHELD')
    .map((r, i) => ({
      sn:          i + 1,
      staffId:     r.staffIdCode ?? '',
      staffName:   r.staffName   ?? '',
      grossSalary: toNum(r.grossSalary),
      netSalary:   toNum(r.netSalary),
      // Prefer live validation reason over the snapshot stored at compute time
      reason:      (validationReasons?.get(r.staffId) ?? r.withheldReason) || undefined,
      department:  r.department     ?? '',
      region:      r.regionName     ?? '',
    }))
}

// ── Pension Schedule ─────────────────────────────────────────

export function buildPensionSchedule(rows: Payroll[]): PensionScheduleRow[] {
  return rows
    .filter(r => r.paymentStatus === 'ACTIVE')
    .map((r, i) => ({
      sn:              i + 1,
      staffId:         r.staffIdCode   ?? '',
      staffName:       r.staffName     ?? '',
      pfaName:         r.pfaName       ?? '',
      rsaPin:          r.rsaPin        ?? '',
      pensionNumber:   (r as any).pensionNumber ?? '',
      pensionEmployee: toNum(r.pensionEmployee),
      pensionEmployer: toNum(r.pensionEmployer),
      totalPension:    toNum(r.pensionEmployee) + toNum(r.pensionEmployer),
      grossSalary:     toNum(r.grossSalary),
    }))
}

// ── PAYE Schedule ────────────────────────────────────────────

export function buildPAYESchedule(rows: Payroll[]): PAYEScheduleRow[] {
  return rows
    .filter(r => r.paymentStatus === 'ACTIVE')
    .map((r, i) => ({
      sn:                     i + 1,
      staffId:                r.staffIdCode ?? '',
      staffName:              r.staffName   ?? '',
      tin:                    (r as any).tin ?? '',
      grossSalary:            toNum(r.grossSalary),
      annualGrossIncome:      toNum(r.annualGrossIncome),
      annualChargeableIncome: toNum(r.annualChargeableIncome),
      annualPAYE:             toNum(r.annualPAYE),
      monthlyPAYE:            toNum(r.monthlyPAYE),
      department:             r.department ?? '',
    }))
}

// ── ITF Schedule (1% of gross, company-borne) ────────────────

export function buildITFSchedule(rows: Payroll[]): StatutoryScheduleRow[] {
  return rows
    .filter(r => r.paymentStatus === 'ACTIVE')
    .map((r, i) => ({
      sn:          i + 1,
      staffId:     r.staffIdCode ?? '',
      staffName:   r.staffName   ?? '',
      grossSalary: toNum(r.grossSalary),
      amount:      round2(toNum(r.grossSalary) * 0.01),
      department:  r.department  ?? '',
    }))
}

// ── NSITF Schedule (1% of gross, company-borne) ──────────────

export function buildNSITFSchedule(rows: Payroll[]): StatutoryScheduleRow[] {
  return rows
    .filter(r => r.paymentStatus === 'ACTIVE')
    .map((r, i) => ({
      sn:          i + 1,
      staffId:     r.staffIdCode ?? '',
      staffName:   r.staffName   ?? '',
      grossSalary: toNum(r.grossSalary),
      amount:      round2(toNum(r.grossSalary) * 0.01),
      department:  r.department  ?? '',
    }))
}

// ── NHF Schedule (2.5% of basic, employee-borne) ────────────

export function buildNHFSchedule(rows: Payroll[]): StatutoryScheduleRow[] {
  return rows
    .filter(r => r.paymentStatus === 'ACTIVE')
    .map((r, i) => ({
      sn:          i + 1,
      staffId:     r.staffIdCode ?? '',
      staffName:   r.staffName   ?? '',
      grossSalary: toNum(r.grossSalary),
      amount:      toNum(r.nhf),
      department:  r.department  ?? '',
    }))
}

// ── Cost Centre Summary ───────────────────────────────────────

export function buildCostCentreSummary(rows: Payroll[]): CostCentreRow[] {
  const map = new Map<string, CostCentreRow>()

  rows
    .filter(r => r.paymentStatus === 'ACTIVE')
    .forEach(r => {
      const key = `${r.regionName ?? ''}||${r.department ?? ''}||${r.unit ?? ''}`
      const existing = map.get(key)
      if (existing) {
        existing.headCount  += 1
        existing.totalGross += toNum(r.grossSalary)
        existing.totalNet   += toNum(r.netSalary)
        existing.totalPAYE  += toNum(r.monthlyPAYE)
        existing.totalPension += toNum(r.pensionEmployee) + toNum(r.pensionEmployer)
      } else {
        map.set(key, {
          region:       r.regionName  ?? '',
          department:   r.department  ?? '',
          unit:         r.unit        ?? '',
          headCount:    1,
          totalGross:   toNum(r.grossSalary),
          totalNet:     toNum(r.netSalary),
          totalPAYE:    toNum(r.monthlyPAYE),
          totalPension: toNum(r.pensionEmployee) + toNum(r.pensionEmployer),
        })
      }
    })

  return Array.from(map.values())
}

// ── Payroll Summary (per period, grouped by category) ────────

export interface PayrollSummaryRow {
  label:            string          // 'Regular Staff' | 'Contract Staff' | 'NYSC & IT' | 'TOTAL'
  headCount:        number
  grossPay:         number
  employerPension:  number | null   // null = exempt (NYSC_IT) — render as blank cell
  nsitf:            number | null
  itf:              number | null
  totalPayrollCost: number
}

export interface PayrollSummaryReport {
  periodName: string
  shortLabel: string  // e.g. "Apr-26"
  rows:       PayrollSummaryRow[]
}

export function buildPayrollSummary(
  payrolls:   Payroll[],
  periodName: string,
  month:      number,
  year:       number,
): PayrollSummaryReport {
  function group(category: string, label: string, statutory: boolean): PayrollSummaryRow {
    const members = payrolls.filter(r => r.category === category)
    const gross   = round2(members.reduce((s, r) => s + toNum(r.grossSalary), 0))
    const empPen  = statutory ? round2(members.reduce((s, r) => s + toNum(r.pensionEmployer), 0)) : null
    const nsitf   = statutory ? round2(gross * 0.01) : null
    const itf     = statutory ? round2(gross * 0.01) : null
    return {
      label,
      headCount:        members.length,
      grossPay:         gross,
      employerPension:  empPen,
      nsitf,
      itf,
      totalPayrollCost: round2(gross + (empPen ?? 0) + (nsitf ?? 0) + (itf ?? 0)),
    }
  }

  const regular  = group('REGULAR',  'Regular Staff',  true)
  const contract = group('CONTRACT', 'Contract Staff', true)
  const nysc     = group('NYSC_IT',  'NYSC & IT',      false)

  const totalGross  = round2(regular.grossPay  + contract.grossPay  + nysc.grossPay)
  const totalEmpPen = round2((regular.employerPension ?? 0) + (contract.employerPension ?? 0))
  const totalNSITF  = round2((regular.nsitf ?? 0) + (contract.nsitf ?? 0))
  const totalITF    = round2((regular.itf   ?? 0) + (contract.itf   ?? 0))

  const total: PayrollSummaryRow = {
    label:            'TOTAL',
    headCount:        regular.headCount + contract.headCount + nysc.headCount,
    grossPay:         totalGross,
    employerPension:  totalEmpPen,
    nsitf:            totalNSITF,
    itf:              totalITF,
    totalPayrollCost: round2(totalGross + totalEmpPen + totalNSITF + totalITF),
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const shortLabel = `${MONTHS[(month - 1) % 12]}-${String(year).slice(-2)}`

  return { periodName, shortLabel, rows: [regular, contract, nysc, total] }
}

// ── Variance (change between two periods) ────────────────────

export interface VarianceSummaryRow {
  label:                 string
  headCountDelta:        number
  grossPayDelta:         number
  totalPayrollCostDelta: number
}

function computeVariance(
  current:  PayrollSummaryReport,
  previous: PayrollSummaryReport,
): VarianceSummaryRow[] {
  return current.rows.map(c => {
    const p = previous.rows.find(r => r.label === c.label)
    return {
      label:                 c.label,
      headCountDelta:        c.headCount        - (p?.headCount        ?? 0),
      grossPayDelta:         round2(c.grossPay         - (p?.grossPay         ?? 0)),
      totalPayrollCostDelta: round2(c.totalPayrollCost - (p?.totalPayrollCost ?? 0)),
    }
  })
}

// ── Aggregate Report (current period vs immediate previous) ──

export interface AggregateComparisonReport {
  currentPeriod:  PayrollSummaryReport
  previousPeriod: PayrollSummaryReport | null
  variance:       VarianceSummaryRow[] | null  // current vs previous; null when no previous
}

export function buildAggregateComparison(
  currentPayrolls:  Payroll[],
  currentPeriod:    { periodName: string; month: number; year: number },
  previousPayrolls: Payroll[],
  previousPeriod:   { periodName: string; month: number; year: number } | null,
): AggregateComparisonReport {
  const curr = buildPayrollSummary(currentPayrolls, currentPeriod.periodName, currentPeriod.month, currentPeriod.year)
  const prev = previousPeriod
    ? buildPayrollSummary(previousPayrolls, previousPeriod.periodName, previousPeriod.month, previousPeriod.year)
    : null
  return {
    currentPeriod:  curr,
    previousPeriod: prev,
    variance:       prev ? computeVariance(curr, prev) : null,
  }
}

// ── Multi-period aggregate (all computed periods for a company) ──

export interface PeriodWithVariance {
  summary:  PayrollSummaryReport
  variance: VarianceSummaryRow[] | null  // null for the earliest period
}

export interface MultiPeriodAggregateReport {
  periods: PeriodWithVariance[]
}

export function buildMultiPeriodAggregate(
  allPeriods: { payrolls: Payroll[]; periodName: string; month: number; year: number }[],
): MultiPeriodAggregateReport {
  const summaries = allPeriods.map(p =>
    buildPayrollSummary(p.payrolls, p.periodName, p.month, p.year)
  )
  return {
    periods: summaries.map((s, i) => ({
      summary:  s,
      variance: i === 0 ? null : computeVariance(s, summaries[i - 1]),
    })),
  }
}

// ── Helpers ───────────────────────────────────────────────────

function toNum(v: any): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v) || 0
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

// =============================================================
// FINANCE PAYROLL SUMMARY
// =============================================================

export interface FinancePayrollCostRow {
  label:            string
  headCount:        number
  grossPay:         number
  pensionEmployer:  number
  nsitf:            number
  itf:              number
  totalPayrollCost: number
  netPay:           number
}

export interface FinanceRemittanceRow {
  bankName:     string
  totalPension: number
  remittance:   number
  nsitf:        number
  itf:          number
  nhf:          number
  [key: string]: number | string  // u_xxx, c_xxx, d_xxx
}

export interface FinancePayrollSummaryReport {
  periodName:   string
  shortLabel:   string
  payrollCost:  FinancePayrollCostRow[]
  remittance:   FinanceRemittanceRow[]
  unions:       { id: string; name: string }[]
  cooperatives: { id: string; name: string }[]
  deductions:   { id: string; name: string }[]
}

export interface FinanceVarianceRow {
  label:                 string
  headCountDelta:        number
  grossPayDelta:         number
  pensionEmployerDelta:  number
  nsitfDelta:            number
  itfDelta:              number
  totalPayrollCostDelta: number
  netPayDelta:           number
}

export interface FinanceAggregateReport {
  currentPeriod:  FinancePayrollSummaryReport
  previousPeriod: FinancePayrollSummaryReport | null
  variance:       FinanceVarianceRow[] | null
}

export function buildFinancePayrollSummary(
  payrolls:            any[],
  unions:              { id: string; name: string; percentage: number }[],
  cooperatives:        { id: string; name: string }[],
  deductions:          { id: string; name: string }[],
  staffUnions:         { staffId: string; unionId: string }[],
  staffCoops:          { staffId: string; cooperativeId: string; totalAmount: any }[],
  staffDedLiabilities: { staffId: string; deductionLiabilityId: string; amount: any }[],
  periodName:          string,
  month:               number,
  year:                number,
): FinancePayrollSummaryReport {
  // Lookup maps
  const unionMemberMap = new Map<string, Set<string>>()
  staffUnions.forEach(su => {
    if (!unionMemberMap.has(su.staffId)) unionMemberMap.set(su.staffId, new Set())
    unionMemberMap.get(su.staffId)!.add(su.unionId)
  })
  const coopAmountMap = new Map<string, Map<string, number>>()
  staffCoops.forEach(sc => {
    if (!coopAmountMap.has(sc.staffId)) coopAmountMap.set(sc.staffId, new Map())
    coopAmountMap.get(sc.staffId)!.set(sc.cooperativeId, toNum(sc.totalAmount))
  })
  const deductAmountMap = new Map<string, Map<string, number>>()
  staffDedLiabilities.forEach(sd => {
    if (!deductAmountMap.has(sd.staffId)) deductAmountMap.set(sd.staffId, new Map())
    deductAmountMap.get(sd.staffId)!.set(sd.deductionLiabilityId, toNum(sd.amount))
  })

  // ── Payroll Cost section (grouped by category) ────────────
  function buildCostRow(category: string, label: string, statutory: boolean): FinancePayrollCostRow {
    const members = payrolls.filter(r => r.category === category)
    const gross   = round2(members.reduce((s, r) => s + toNum(r.grossSalary), 0))
    const pensER  = statutory ? round2(members.reduce((s, r) => s + toNum(r.pensionEmployer), 0)) : 0
    const nsitf   = statutory ? round2(gross * 0.01) : 0
    const itf     = statutory ? round2(gross * 0.01) : 0
    return {
      label,
      headCount:        members.length,
      grossPay:         gross,
      pensionEmployer:  pensER,
      nsitf,
      itf,
      totalPayrollCost: round2(gross + pensER + nsitf + itf),
      netPay:           round2(members.reduce((s, r) => s + toNum(r.netSalary), 0)),
    }
  }

  const regular  = buildCostRow('REGULAR',  'Regular Staff',  true)
  const contract = buildCostRow('CONTRACT', 'Contract Staff', true)
  const nysc     = buildCostRow('NYSC_IT',  'NYSC & IT',      false)

  const costTotal: FinancePayrollCostRow = {
    label:            'TOTAL',
    headCount:        regular.headCount + contract.headCount + nysc.headCount,
    grossPay:         round2(regular.grossPay  + contract.grossPay  + nysc.grossPay),
    pensionEmployer:  round2(regular.pensionEmployer  + contract.pensionEmployer),
    nsitf:            round2(regular.nsitf + contract.nsitf),
    itf:              round2(regular.itf   + contract.itf),
    totalPayrollCost: round2(regular.totalPayrollCost + contract.totalPayrollCost + nysc.totalPayrollCost),
    netPay:           round2(regular.netPay + contract.netPay + nysc.netPay),
  }

  const payrollCost = [regular, contract, nysc, costTotal]

  // ── Remittance section (grouped by bank) ──────────────────
  const bankMap = new Map<string, FinanceRemittanceRow>()

  for (const r of payrolls) {
    const bank = (r.bankName as string) || 'Unknown'
    if (!bankMap.has(bank)) {
      const row: FinanceRemittanceRow = { bankName: bank, totalPension: 0, remittance: 0, nsitf: 0, itf: 0, nhf: 0 }
      unions.forEach(u => { row[`u_${u.id}`] = 0 })
      cooperatives.forEach(c => { row[`c_${c.id}`] = 0 })
      deductions.forEach(d => { row[`d_${d.id}`] = 0 })
      bankMap.set(bank, row)
    }
    const row     = bankMap.get(bank)!
    const gross   = toNum(r.grossSalary)
    const isStatutory = r.category !== 'NYSC_IT'
    const memberUnions  = unionMemberMap.get(r.staffId)  ?? new Set<string>()
    const staffCoopMap  = coopAmountMap.get(r.staffId)   ?? new Map<string, number>()
    const staffDeductMap = deductAmountMap.get(r.staffId) ?? new Map<string, number>()

    row.totalPension = round2(row.totalPension + toNum(r.pensionEmployee) + toNum(r.pensionEmployer))
    row.remittance   = round2(row.remittance   + toNum(r.netSalary))
    row.nsitf        = round2(row.nsitf + (isStatutory ? round2(gross * 0.01) : 0))
    row.itf          = round2(row.itf   + (isStatutory ? round2(gross * 0.01) : 0))
    row.nhf          = round2(row.nhf   + toNum(r.nhf))
    unions.forEach(u => {
      if (memberUnions.has(u.id))
        (row[`u_${u.id}`] as number) = round2((row[`u_${u.id}`] as number) + round2(gross * u.percentage))
    })
    cooperatives.forEach(c => {
      (row[`c_${c.id}`] as number) = round2((row[`c_${c.id}`] as number) + round2(staffCoopMap.get(c.id) ?? 0))
    })
    deductions.forEach(d => {
      (row[`d_${d.id}`] as number) = round2((row[`d_${d.id}`] as number) + round2(staffDeductMap.get(d.id) ?? 0))
    })
  }

  const remittanceRows = [...bankMap.values()]

  const remittanceTotal: FinanceRemittanceRow = {
    bankName: 'TOTAL',
    totalPension: round2(remittanceRows.reduce((s, r) => s + r.totalPension, 0)),
    remittance:   round2(remittanceRows.reduce((s, r) => s + r.remittance, 0)),
    nsitf:        round2(remittanceRows.reduce((s, r) => s + r.nsitf, 0)),
    itf:          round2(remittanceRows.reduce((s, r) => s + r.itf, 0)),
    nhf:          round2(remittanceRows.reduce((s, r) => s + r.nhf, 0)),
  }
  unions.forEach(u => {
    remittanceTotal[`u_${u.id}`] = round2(remittanceRows.reduce((s, r) => s + ((r[`u_${u.id}`] as number) || 0), 0))
  })
  cooperatives.forEach(c => {
    remittanceTotal[`c_${c.id}`] = round2(remittanceRows.reduce((s, r) => s + ((r[`c_${c.id}`] as number) || 0), 0))
  })
  deductions.forEach(d => {
    remittanceTotal[`d_${d.id}`] = round2(remittanceRows.reduce((s, r) => s + ((r[`d_${d.id}`] as number) || 0), 0))
  })

  remittanceRows.push(remittanceTotal)

  const MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const shortLabel = `${MONTHS[(month - 1) % 12]}-${String(year).slice(-2)}`

  return {
    periodName,
    shortLabel,
    payrollCost,
    remittance:   remittanceRows,
    unions:       unions.map(u => ({ id: u.id, name: u.name })),
    cooperatives: cooperatives.map(c => ({ id: c.id, name: c.name })),
    deductions:   deductions.map(d => ({ id: d.id, name: d.name })),
  }
}

function computeFinanceVariance(
  current:  FinancePayrollSummaryReport,
  previous: FinancePayrollSummaryReport,
): FinanceVarianceRow[] {
  return current.payrollCost.map(c => {
    const p = previous.payrollCost.find(r => r.label === c.label)
    return {
      label:                 c.label,
      headCountDelta:        c.headCount        - (p?.headCount        ?? 0),
      grossPayDelta:         round2(c.grossPay        - (p?.grossPay        ?? 0)),
      pensionEmployerDelta:  round2(c.pensionEmployer - (p?.pensionEmployer ?? 0)),
      nsitfDelta:            round2(c.nsitf           - (p?.nsitf           ?? 0)),
      itfDelta:              round2(c.itf             - (p?.itf             ?? 0)),
      totalPayrollCostDelta: round2(c.totalPayrollCost - (p?.totalPayrollCost ?? 0)),
      netPayDelta:           round2(c.netPay           - (p?.netPay           ?? 0)),
    }
  })
}

export function buildFinanceAggregateComparison(
  currentPayrolls:     any[],
  currentPeriod:       { periodName: string; month: number; year: number },
  unions:              { id: string; name: string; percentage: number }[],
  cooperatives:        { id: string; name: string }[],
  deductions:          { id: string; name: string }[],
  currentStaffUnions:  { staffId: string; unionId: string }[],
  currentStaffCoops:   { staffId: string; cooperativeId: string; totalAmount: any }[],
  currentStaffDeds:    { staffId: string; deductionLiabilityId: string; amount: any }[],
  previousPayrolls:    any[],
  previousPeriod:      { periodName: string; month: number; year: number } | null,
  previousStaffUnions: { staffId: string; unionId: string }[],
  previousStaffCoops:  { staffId: string; cooperativeId: string; totalAmount: any }[],
  previousStaffDeds:   { staffId: string; deductionLiabilityId: string; amount: any }[],
): FinanceAggregateReport {
  const curr = buildFinancePayrollSummary(
    currentPayrolls, unions, cooperatives, deductions,
    currentStaffUnions, currentStaffCoops, currentStaffDeds,
    currentPeriod.periodName, currentPeriod.month, currentPeriod.year,
  )
  const prev = previousPeriod
    ? buildFinancePayrollSummary(
        previousPayrolls, unions, cooperatives, deductions,
        previousStaffUnions, previousStaffCoops, previousStaffDeds,
        previousPeriod.periodName, previousPeriod.month, previousPeriod.year,
      )
    : null
  return {
    currentPeriod:  curr,
    previousPeriod: prev,
    variance:       prev ? computeFinanceVariance(curr, prev) : null,
  }
}

