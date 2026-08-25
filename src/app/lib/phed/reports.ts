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
  LabourCategoryKey,
  CostCentreSummaryReport,
  CostCentreSheet,
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
      voluntaryPension: toNum(r.voluntaryPension),
      pensionEmployer: toNum(r.pensionEmployer),
      // Reference total: Employee + Voluntary + Employer (E + F + G)
      totalPension:    toNum(r.pensionEmployee) + toNum(r.voluntaryPension) + toNum(r.pensionEmployer),
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
// Reproduces the 3-sheet "Payroll Cost Centre Summary" reference workbook:
//   1. Finance Report 1      — feeder × labour category, grouped by region, with
//                              region statutory rollups (Gross, Employer Pension, EROBREA, NSITF, ITF).
//   2. Finance Report 2      — same feeder grid, region rollups (Staff Cost, Basic Salary Cost).
//   3. Head Office Staff Cost — department groups × labour category + Staff Cost by Department.
//
// Allocation rules:
//   - CONTRACT staff  → "Contract Staff" column
//   - NYSC_IT staff   → "IT/NYSC" column
//   - REGULAR staff   → one of the 6 labour categories by department (fallback: Admin)

// EROBREA — additive payroll element (Total Gross = Gross + EROBREA, Total Net = Net + EROBREA).
// Kept as a per-staff variable that currently defaults to 0 until the business defines its source.
const EROBREA_PER_STAFF = 0

const LABOUR_LABEL: Record<LabourCategoryKey, string> = {
  sales:             'Sales Expenses-Labour',
  maintenance:       'Maintenance Expenses-Labour',
  customerService:   'Customer Service - Labour',
  operations:        'Operations Expenses-Labour',
  admin:             'Admin Expenses-Labour',
  billingCollection: 'Billing and Collection -Labour',
  contractStaff:     'Contract Staff',
  itNysc:            'IT/NYSC',
}
const LABOUR_LABEL_HO: Record<LabourCategoryKey, string> = { ...LABOUR_LABEL, itNysc: 'NYSC/IT' }

// Column order differs between the Finance sheets and the Head Office sheet (per template).
const FINANCE_ORDER:    LabourCategoryKey[] = ['sales', 'maintenance', 'customerService', 'operations', 'admin', 'billingCollection', 'contractStaff', 'itNysc']
const HEAD_OFFICE_ORDER: LabourCategoryKey[] = ['admin', 'billingCollection', 'contractStaff', 'customerService', 'maintenance', 'operations', 'sales', 'itNysc']

// Department → labour category (REGULAR staff only). Keys are lowercase-trimmed.
const DEPARTMENT_CATEGORY: Record<string, LabourCategoryKey> = {
  // Customer Service
  'call center': 'customerService',
  'customer care': 'customerService',
  'customer service': 'customerService',
  // Maintenance / Technical / Projects
  'core engineering': 'maintenance',
  'high tension line/ preventive maintenance': 'maintenance',
  'network operations and maintenance': 'maintenance',
  'pc&m / preventive maintenance': 'maintenance',
  'pc&m hq/workshop/ preventive maintenance': 'maintenance',
  'preventive maintenance': 'maintenance',
  'substation/ preventive maintenance': 'maintenance',
  'technical': 'maintenance',
  'project execution': 'maintenance',
  'project planning': 'maintenance',
  // Billing & Collection
  'billing': 'billingCollection',
  'revenue cycle management': 'billingCollection',
  'energy audit & accounting': 'billingCollection',
  'md metering': 'billingCollection',
  'metering': 'billingCollection',
  'non md metering': 'billingCollection',
  'recovery/hq task force': 'billingCollection',
  'revenue protection': 'billingCollection',
  'revenue protection (admin)': 'billingCollection',
  'strategy & collections monitoring': 'billingCollection',
  // Admin
  'admin services': 'admin',
  'civil construction/repairs': 'admin',
  'fleet & cug management': 'admin',
  'janitorial & general services': 'admin',
  'compensation & benefits': 'admin',
  'employee relations': 'admin',
  'human resources': 'admin',
  'learning and development': 'admin',
  'talent management': 'admin',
  'workforce planning and database management': 'admin',
  'information systems audit': 'admin',
  'information technology': 'admin',
  'internal audit': 'admin',
  'internal control': 'admin',
  'internal control, fraud and investigation': 'admin',
  'internal process': 'admin',
  'process audit': 'admin',
  'risk management & fraud investigation': 'admin',
  'legal': 'admin',
  'legal & regulatory': 'admin',
  'regulatory': 'admin',
  "ceo's office": 'admin',
  'accounts payable': 'admin',
  'assets management': 'admin',
  'debt recovery': 'admin',
  'finance': 'admin',
  'financial reporting': 'admin',
  'mis & documentation': 'admin',
  'recovery & remedial management-debt recovery': 'admin',
  'revenue assurance & rec': 'admin',
  'tax management': 'admin',
  'treasury': 'admin',
  'application support & service management': 'admin',
  'data analytics & ai': 'admin',
  'database and solutions architecture': 'admin',
  'infrastructure & enterprise network security': 'admin',
  'it strategy and governance': 'admin',
  'software development unit': 'admin',
  'community engagement & csr': 'admin',
  'corporate communications': 'admin',
  'procurement': 'admin',
  'stores': 'admin',
  // Operations
  'centralized system operations': 'operations',
  'dispatch-centralized system operations': 'operations',
  'system planning': 'operations',
  'assault': 'operations',
  'haulage & accident': 'operations',
  'security/operations': 'operations',
  'security': 'operations',
  'geographical information system': 'operations',
  'hse & esg': 'operations',
  // Sales
  'commercial': 'sales',
  'mis & resources': 'sales',
  'ceom': 'sales',
  'ceo marshall': 'sales',
  'special projects & business development': 'sales',
}

// Head Office sheet: department groups in template order. `label` = subtotal row text (null = no subtotal).
const HEAD_OFFICE_GROUPS: { label: string | null; departments: string[] }[] = [
  { label: 'Admin Services Total', departments: ['admin services', 'civil construction/repairs', 'fleet & cug management', 'janitorial & general services'] },
  { label: 'Centralized System Operation/Dispatch Total', departments: ['centralized system operations', 'dispatch-centralized system operations', 'system planning'] },
  { label: 'Commercial Total', departments: ['commercial', 'mis & resources'] },
  { label: 'Corporate Communications Total', departments: ['community engagement & csr', 'corporate communications'] },
  { label: 'Customer Care Total', departments: ['call center', 'customer care', 'customer service'] },
  { label: 'Finance Total', departments: ['accounts payable', 'assets management', 'debt recovery', 'finance', 'financial reporting', 'mis & documentation', 'recovery & remedial management-debt recovery', 'revenue assurance & rec', 'tax management', 'treasury'] },
  { label: 'Geographical Information System Total', departments: ['geographical information system'] },
  { label: 'HSE & ESG Total', departments: ['hse & esg'] },
  { label: 'Human Capital Management Total', departments: ['compensation & benefits', 'employee relations', 'human resources', 'learning and development', 'talent management', 'workforce planning and database management'] },
  { label: 'Information Technology Total', departments: ['application support & service management', 'data analytics & ai', 'database and solutions architecture', 'infrastructure & enterprise network security', 'information technology', 'it strategy and governance', 'software development unit'] },
  { label: 'Internal Audit Total', departments: ['information systems audit', 'information technology', 'internal audit', 'internal control', 'internal control, fraud and investigation', 'internal process', 'process audit', 'risk management & fraud investigation'] },
  { label: 'Legal & Regulatory Total', departments: ['legal', 'legal & regulatory', 'regulatory'] },
  { label: "MD/CEO's Office Total", departments: ["ceo's office"] },
  { label: null, departments: ['ceom', 'ceo marshall'] },
  { label: 'Procurement Total', departments: ['procurement'] },
  { label: 'Revenue Protection Total', departments: ['recovery/hq task force', 'revenue protection', 'revenue protection (admin)'] },
  { label: 'Security Total', departments: ['assault', 'haulage & accident', 'security/operations', 'security'] },
  { label: 'Stores Total', departments: ['stores'] },
  { label: 'Billing Total', departments: ['billing'] },
  { label: 'Revenue Cycle Management Total', departments: ['revenue cycle management', 'energy audit & accounting', 'md metering', 'metering', 'non md metering'] },
  { label: 'Special Projects & Business Development Total', departments: ['special projects & business development'] },
  { label: 'Strategy & Collections Monitoring Total', departments: ['strategy & collections monitoring'] },
  { label: 'Project Execution Total', departments: ['project execution'] },
  { label: 'Project Planning Total', departments: ['project planning'] },
  { label: 'Technical Total', departments: ['core engineering', 'high tension line/ preventive maintenance', 'network operations and maintenance', 'pc&m / preventive maintenance', 'pc&m hq/workshop/ preventive maintenance', 'preventive maintenance', 'substation/ preventive maintenance', 'technical'] },
]

// Preferred region ordering (matches the template's region block order).
const REGION_ORDER = ['head office', 'region 1', 'region 2', 'region 3', 'sub region 1', 'region 4', 'region 5', 'region 6', 'sub region 2', 'region 7', 'phed']

const catOf = (r: Payroll): LabourCategoryKey => {
  if (r.category === 'CONTRACT') return 'contractStaff'
  if (r.category === 'NYSC_IT') return 'itNysc'
  const dept = (r.department ?? '').trim().toLowerCase()
  return DEPARTMENT_CATEGORY[dept] ?? 'admin'
}

// Total payroll cost of one employee (matches buildPayrollSummary.totalPayrollCost).
const staffCostOf = (r: Payroll): number => {
  const gross = toNum(r.grossSalary)
  if (r.category === 'NYSC_IT') return round2(gross)
  return round2(gross + toNum(r.pensionEmployer) + round2(gross * 0.01) + round2(gross * 0.01))
}

const zeroCats = (): Record<LabourCategoryKey, number> => ({
  sales: 0, maintenance: 0, customerService: 0, operations: 0,
  admin: 0, billingCollection: 0, contractStaff: 0, itNysc: 0,
})

function catSums(list: Payroll[]): Record<LabourCategoryKey, number> {
  const acc = zeroCats()
  for (const r of list) {
    const c = catOf(r)
    acc[c] = round2(acc[c] + toNum(r.grossSalary))
  }
  return acc
}

function catCols(order: LabourCategoryKey[], labels: Record<LabourCategoryKey, string>) {
  return order.map(k => ({ key: k, header: labels[k], type: 'currency' as const, width: 16 }))
}

function catRow(cats: Record<LabourCategoryKey, number>, order: LabourCategoryKey[]): Record<string, any> {
  const row: Record<string, any> = {}
  for (const k of order) row[k] = cats[k]
  return row
}

function orderRegions(regionBuckets: Map<string, Map<string, Payroll[]>>): string[] {
  const names = [...regionBuckets.keys()]
  const idx = (n: string) => {
    const i = REGION_ORDER.indexOf(n.toLowerCase())
    return i === -1 ? REGION_ORDER.length : i
  }
  return names.sort((a, b) => {
    const d = idx(a) - idx(b)
    return d !== 0 ? d : a.localeCompare(b)
  })
}

export function buildCostCentreSummary(
  periodName: string,
  rows: Payroll[],
  feederMap: Map<string, string> = new Map(),
): CostCentreSummaryReport {
  const active = rows.filter(r => r.paymentStatus === 'ACTIVE')

  // ── Bucket staff by region → feeder ─────────────────────────
  const regionBuckets = new Map<string, Map<string, Payroll[]>>()
  for (const r of active) {
    const region = (r.regionName ?? '').trim() || 'Unassigned'
    const feeder = (feederMap.get(r.staffId) ?? '').trim() || 'Unassigned'
    if (!regionBuckets.has(region)) regionBuckets.set(region, new Map())
    const feeders = regionBuckets.get(region)!
    if (!feeders.has(feeder)) feeders.set(feeder, [])
    feeders.get(feeder)!.push(r)
  }

  const orderedRegions = orderRegions(regionBuckets)

  // ── Sheet 1 & 2: feeder grid + region rollups ───────────────
  const f1Rows: Record<string, any>[] = []
  const f2Rows: Record<string, any>[] = []
  let grand = { gross: 0, pension: 0, erobrea: 0, nsitf: 0, itf: 0, staffCost: 0, basic: 0 }

  const regionStat = (list: Payroll[]) => {
    let gross = 0, pension = 0, basic = 0, erobrea = 0
    for (const r of list) {
      gross   = round2(gross + toNum(r.grossSalary))
      pension = round2(pension + (r.category === 'NYSC_IT' ? 0 : toNum(r.pensionEmployer)))
      basic   = round2(basic + toNum(r.basicSalary))
      erobrea = round2(erobrea + EROBREA_PER_STAFF)  // additive variable; 0 until sourced
    }
    const nsitf = round2(gross * 0.01)
    const itf   = round2(gross * 0.01)
    const staffCost = round2(gross + pension + nsitf + itf)
    return { gross, pension, erobrea, nsitf, itf, staffCost, basic }
  }

  for (const region of orderedRegions) {
    const feeders = regionBuckets.get(region)!
    const regionRows: Payroll[] = []
    for (const feeder of [...feeders.keys()].sort()) {
      const list = feeders.get(feeder)!
      regionRows.push(...list)
      const cats = catSums(list)
      const total = Object.values(cats).reduce((s, v) => round2(s + v), 0)
      f1Rows.push({ feeder, region, ...catRow(cats, FINANCE_ORDER), totalPerFeeder: total })
      f2Rows.push({ feeder, region, ...catRow(cats, FINANCE_ORDER), totalPerFeeder: total })
    }

    const st = regionStat(regionRows)
    grand.gross     = round2(grand.gross + st.gross)
    grand.pension   = round2(grand.pension + st.pension)
    grand.erobrea   = round2(grand.erobrea + st.erobrea)
    grand.nsitf     = round2(grand.nsitf + st.nsitf)
    grand.itf       = round2(grand.itf + st.itf)
    grand.staffCost = round2(grand.staffCost + st.staffCost)
    grand.basic     = round2(grand.basic + st.basic)

    const rc = catSums(regionRows)
    const regionTotal = Object.values(rc).reduce((s, v) => round2(s + v), 0)
    f1Rows.push({
      feeder: '', region: `${region} — Total`,
      ...catRow(rc, FINANCE_ORDER), totalPerFeeder: regionTotal,
      grossPayByRegion: st.gross, employerPension: st.pension, erobrea: st.erobrea, nsitf: st.nsitf, itf: st.itf,
    })
    f2Rows.push({
      feeder: '', region: `${region} — Total`,
      ...catRow(rc, FINANCE_ORDER), totalPerFeeder: regionTotal,
      staffCostByRegion: st.staffCost, basicSalaryCost: st.basic,
    })
  }

  f1Rows.push({
    feeder: '', region: 'GRAND TOTAL', ...catRow(zeroCats(), FINANCE_ORDER),
    totalPerFeeder: grand.gross, grossPayByRegion: grand.gross, employerPension: grand.pension,
    erobrea: grand.erobrea, nsitf: grand.nsitf, itf: grand.itf,
  })
  f2Rows.push({
    feeder: '', region: 'GRAND TOTAL', ...catRow(zeroCats(), FINANCE_ORDER),
    totalPerFeeder: grand.gross, staffCostByRegion: grand.staffCost, basicSalaryCost: grand.basic,
  })

  const financeBase = [
    { key: 'feeder', header: 'Feeder', type: 'text' as const, width: 24 },
    { key: 'region', header: 'Region', type: 'text' as const, width: 18 },
    ...catCols(FINANCE_ORDER, LABOUR_LABEL),
    { key: 'totalPerFeeder', header: 'Total Per Feeder', type: 'currency' as const, width: 16 },
  ]

  const finance1: CostCentreSheet = {
    name: 'Finance Report 1',
    columns: [
      ...financeBase,
      { key: 'grossPayByRegion', header: 'Gross Pay by Region', type: 'currency', width: 18 },
      { key: 'employerPension', header: 'Employer Pension by Regions', type: 'currency', width: 18 },
      { key: 'erobrea', header: 'EROBREA by Regions', type: 'currency', width: 16 },
      { key: 'nsitf', header: 'NSITF by Regions', type: 'currency', width: 16 },
      { key: 'itf', header: 'ITF by Regions', type: 'currency', width: 16 },
    ],
    rows: f1Rows,
  }

  const finance2: CostCentreSheet = {
    name: 'Finance Report 2',
    columns: [
      ...financeBase,
      { key: 'staffCostByRegion', header: 'Staff Cost by Region', type: 'currency', width: 18 },
      { key: 'basicSalaryCost', header: 'Basic Salary Cost by Regions', type: 'currency', width: 18 },
    ],
    rows: f2Rows,
  }

  // ── Sheet 3: Head Office Staff Cost (department groups) ─────
  const hoRows: Record<string, any>[] = []
  const deptBuckets = new Map<string, Payroll[]>()
  for (const r of active) {
    const dept = (r.department ?? '').trim() || 'Unassigned'
    if (!deptBuckets.has(dept)) deptBuckets.set(dept, [])
    deptBuckets.get(dept)!.push(r)
  }

  const knownDeptSet = new Set<string>()
  let grandStaffCost = 0
  const hoCatGrand = zeroCats()

  const pushDeptRow = (dept: string, list: Payroll[]) => {
    const cats = catSums(list)
    const staffCost = round2(list.reduce((s, r) => s + staffCostOf(r), 0))
    for (const k of HEAD_OFFICE_ORDER) hoCatGrand[k] = round2(hoCatGrand[k] + cats[k])
    grandStaffCost = round2(grandStaffCost + staffCost)
    hoRows.push({ department: dept, ...catRow(cats, HEAD_OFFICE_ORDER), staffCost })
  }

  const pushGroupTotal = (rowsSoFar: Record<string, any>[], label: string) => {
    if (!rowsSoFar.length) return
    const acc = zeroCats()
    let staffCost = 0
    for (const row of rowsSoFar) {
      for (const k of HEAD_OFFICE_ORDER) acc[k] = round2(acc[k] + (Number(row[k]) || 0))
      staffCost = round2(staffCost + (Number(row.staffCost) || 0))
    }
    hoRows.push({ department: label, ...catRow(acc, HEAD_OFFICE_ORDER), staffCost })
  }

  for (const group of HEAD_OFFICE_GROUPS) {
    const before = hoRows.length
    for (const deptKey of group.departments) {
      // Find matching department buckets by case-insensitive match (DB free-text may differ in case).
      const match = [...deptBuckets.keys()].find(k => k.toLowerCase() === deptKey)
      if (!match) continue
      if (knownDeptSet.has(match)) {
        // Duplicate label in the template (e.g. "Information Technology" appears in both the
        // Information Technology group and the Internal Audit group). Keep the row to preserve
        // the template layout, but leave it at zero so staff are counted only once.
        hoRows.push({ department: match, ...catRow(zeroCats(), HEAD_OFFICE_ORDER), staffCost: 0 })
        continue
      }
      knownDeptSet.add(match)
      pushDeptRow(match, deptBuckets.get(match)!)
    }
    if (group.label) {
      const rowsSoFar = hoRows.slice(before)
      pushGroupTotal(rowsSoFar, group.label)
    }
  }

  // Departments not present in the template taxonomy → "Other Departments" (Admin) group.
  const otherDepts = [...deptBuckets.keys()].filter(k => !knownDeptSet.has(k)).sort()
  if (otherDepts.length) {
    const before = hoRows.length
    for (const dept of otherDepts) pushDeptRow(dept, deptBuckets.get(dept)!)
    pushGroupTotal(hoRows.slice(before), 'Other Departments Total')
  }

  hoRows.push({
    department: 'Grand Total', ...catRow(hoCatGrand, HEAD_OFFICE_ORDER), staffCost: grandStaffCost,
  })

  const headOffice: CostCentreSheet = {
    name: 'Head Office Staff Cost',
    columns: [
      { key: 'department', header: 'Departments', type: 'text', width: 34 },
      ...catCols(HEAD_OFFICE_ORDER, LABOUR_LABEL_HO),
      { key: 'staffCost', header: 'Staff Cost by Department', type: 'currency', width: 20 },
    ],
    rows: hoRows,
  }

  return { periodName, sheets: [finance1, finance2, headOffice] }
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

