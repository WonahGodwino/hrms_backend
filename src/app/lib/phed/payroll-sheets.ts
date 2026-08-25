// ============================================================
// PHED Module – Payroll Register + Statutory Schedule Sheets
// Replicates the reference workbooks sheet-for-sheet with
// period-based (dynamic) sheet names.
// ============================================================

import type { PhedComputedPayroll as PrismaPayroll } from '@prisma/client'
import type { CostCentreSheet } from './types'

type Payroll = PrismaPayroll

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toNum(v: any): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v) || 0
}
function r2(v: number): number { return Math.round(v * 100) / 100 }

export interface PeriodLabels {
  monthName: string   // February
  monthShort: string  // Feb
  yy: string          // 26
  monthYear: string   // February 2026
  apostrophe: string  // Feb'26
  dot: string         // Feb.26
  space: string       // Feb 26
  monthSpace: string  // February 26
  shortYear: string   // Feb 2026
}

export function periodLabels(month: number, year: number): PeriodLabels {
  const m = MONTH_NAMES[(month - 1) % 12] ?? 'January'
  const s = MONTH_SHORT[(month - 1) % 12] ?? 'Jan'
  const yy = String(year).slice(-2)
  return {
    monthName: m, monthShort: s, yy,
    monthYear: `${m} ${year}`,
    apostrophe: `${s}'${yy}`,
    dot: `${s}.${yy}`,
    space: `${s} ${yy}`,
    monthSpace: `${m} ${yy}`,
    shortYear: `${s} ${year}`,
  }
}

// ── PAYE band breakdown (annual) matching the reference band columns ──
// ₦800,000 @ 0% · Next ₦2,200,000 @ 15% · Next ₦9,000,000 @ 18% ·
// Next ₦13,000,000 @ 21% · Next ₦25,000,000 @ 23% · Above ₦50,000,000 @ 25%
const BANDS = [
  { to: 800_000, rate: 0.00 },
  { to: 3_000_000, rate: 0.15 },
  { to: 12_000_000, rate: 0.18 },
  { to: 25_000_000, rate: 0.21 },
  { to: 50_000_000, rate: 0.23 },
  { to: Infinity, rate: 0.25 },
]

export function taxBandBreakdown(annualChargeableIncome: number): number[] {
  if (annualChargeableIncome <= 0) return [0, 0, 0, 0, 0, 0]
  const out: number[] = []
  let lower = 0
  for (const band of BANDS) {
    const taxable = Math.max(0, Math.min(annualChargeableIncome, band.to) - lower)
    out.push(r2(taxable * band.rate))
    lower = band.to
  }
  return out
}

// ── Register column definitions (reference-exact order) ──
export const REGISTER_COLS: { key: string; header: string; type: 'text' | 'currency' }[] = [
  { key: 'employeeId', header: 'Employee ID', type: 'text' },
  { key: 'contractStaffId', header: 'Contract Staff ID / Entry Date', type: 'text' },
  { key: 'name', header: 'Name', type: 'text' },
  { key: 'approvedRole', header: 'Approved Role', type: 'text' },
  { key: 'payPoint', header: 'Pay Point', type: 'text' },
  { key: 'grade', header: 'Grade', type: 'text' },
  { key: 'level', header: 'Level', type: 'text' },
  { key: 'initialGrossPay', header: 'Initial Gross Pay', type: 'currency' },
  { key: 'basic', header: 'Basic', type: 'currency' },
  { key: 'housing', header: 'Housing Allow', type: 'currency' },
  { key: 'transport', header: 'Transport Allow', type: 'currency' },
  { key: 'furniture', header: 'Furniture', type: 'currency' },
  { key: 'domestic', header: 'Domestic', type: 'currency' },
  { key: 'meal', header: 'Meal', type: 'currency' },
  { key: 'hazard', header: 'Hazard', type: 'currency' },
  { key: 'electricity', header: 'Electricity', type: 'currency' },
  { key: 'otherAllowances', header: 'Other Allowances', type: 'currency' },
  { key: 'discretionary', header: 'Discretionary Allowances', type: 'currency' },
  { key: 'carSubsidy', header: 'Car Subsidy', type: 'currency' },
  { key: 'entertainment', header: 'Entertainment', type: 'currency' },
  { key: 'dataAllowance', header: 'Data Allowance', type: 'currency' },
  { key: 'nightAllowance', header: 'Night Allowance', type: 'currency' },
  { key: 'overtime', header: 'Overtime', type: 'currency' },
  { key: 'arrears', header: 'Arrears', type: 'currency' },
  { key: 'grossPay', header: 'Gross Pay', type: 'currency' },
  { key: 'reimbursement', header: 'Reimbursement', type: 'currency' },
  { key: 'lifeAssurance', header: 'Life Assurance', type: 'currency' },
  { key: 'nhf', header: 'NHF', type: 'currency' },
  { key: 'pensionEmployee', header: "Employee's Pension Contribution", type: 'currency' },
  { key: 'voluntaryPension', header: 'Voluntary Pension', type: 'currency' },
  { key: 'insurance', header: 'Insurance', type: 'currency' },
  { key: 'paye', header: 'PAYE', type: 'currency' },
  { key: 'cashAdvanced', header: 'Cash Advanced', type: 'currency' },
  { key: 'loan', header: 'Loan', type: 'currency' },
  { key: 'domesticLoan', header: 'Domestic Loan', type: 'currency' },
  { key: 'nuee', header: 'NUEE Check-off dues (Union)', type: 'currency' },
  { key: 'ssaeac', header: 'SSAEAC Check-off Dues (Union)', type: 'currency' },
  { key: 'devptLevy', header: 'Devpt Levy', type: 'currency' },
  { key: 'phZonalThrift', header: 'PH Zonal Thrift (Cooperative)', type: 'currency' },
  { key: 'nsmpcsuyo', header: 'NSMPCSUYO (Cooperative)', type: 'currency' },
  { key: 'nemscoopcal', header: 'NEMSCOOPCAL (Cooperative)', type: 'currency' },
  { key: 'nemscoopuyo', header: 'NEMSCOOPUYO (Cooperative)', type: 'currency' },
  { key: 'dedLiabilities', header: 'DED/LIABILITIES', type: 'currency' },
  { key: 'nepascoopcal', header: 'NEPASCOOPCAL (Cooperative)', type: 'currency' },
  { key: 'nepascoopiko', header: 'NEPASCOOPIKO (Cooperative)', type: 'currency' },
  { key: 'nepascoopphc', header: 'NEPASCOOPPHC (Cooperative)', type: 'currency' },
  { key: 'nepascoopuyo', header: 'NEPASCOOPUYO (Cooperative)', type: 'currency' },
  { key: 'ielCredit', header: 'IEL CREDIT & INVESTMENT COOP (Cooperative)', type: 'currency' },
  { key: 'phedStaffCoop', header: 'PHED Staff Cooperative (Cooperative)', type: 'currency' },
  { key: 'totalDeduction', header: 'Total Deduction', type: 'currency' },
  { key: 'netPay', header: 'Net Pay', type: 'currency' },
  { key: 'pensionEmployer', header: "Employer's Pension Contribution", type: 'currency' },
  { key: 'salaryCost', header: 'Salary Cost', type: 'currency' },
  { key: 'rentRelief', header: 'Rent Relief', type: 'currency' },
  { key: 'totalAllowableDeduction', header: 'Total allowable deduction', type: 'currency' },
  { key: 'totalTaxableIncome', header: 'Total taxable income', type: 'currency' },
  { key: 'band1', header: '₦800,000 @ 0%', type: 'currency' },
  { key: 'band2', header: 'Next ₦2,200,000 @ 15%', type: 'currency' },
  { key: 'band3', header: 'Next ₦9,000,000 @ 18%', type: 'currency' },
  { key: 'band4', header: 'Next ₦13,000,000 @ 21%', type: 'currency' },
  { key: 'band5', header: 'Next ₦25,000,000 @ 23%', type: 'currency' },
  { key: 'band6', header: 'Above ₦50,000,000 @ 25%', type: 'currency' },
  { key: 'payeAnnual', header: 'PAYE', type: 'currency' },
  { key: 'totalGrossPay', header: 'Total Gross Pay', type: 'currency' },
  { key: 'totalNetPay', header: 'Total Net Pay', type: 'currency' },
]

export interface RegisterCtx {
  payPointMap?: Map<string, string>      // staffId -> pay point name
  jobTitleMap?: Map<string, string>      // staffId -> approved role / job title
  stateMap?: Map<string, string>         // staffId -> state of residence
  unionMap?: Map<string, number>         // staffId -> NUEE amount
  ssaeacMap?: Map<string, number>        // staffId -> SSAEAC amount
  coopMap?: Map<string, Record<string, number>> // staffId -> { coopName: amount }
}

export function mapRegisterRow(p: Payroll, ctx: RegisterCtx = {}): Record<string, any> {
  const initialGrossPay = r2(
    toNum(p.basicSalary) + toNum(p.housingAllowance) + toNum(p.transportAllowance) +
    toNum(p.furnitureAllowance) + toNum(p.mealSubsidy) + toNum(p.leaveAllowance) +
    toNum(p.domesticAllowance) + toNum(p.hazardAllowance) + toNum(p.electricityAllowance) +
    toNum(p.otherAllowances)
  )
  const annualChargeable = toNum(p.annualChargeableIncome)
  const annualGross = toNum(p.annualGrossIncome)
  const bands = taxBandBreakdown(annualChargeable)
  const coops = ctx.coopMap?.get(p.staffId) ?? {}
  const coopAmt = (name: string) => {
    for (const k of Object.keys(coops)) if (k.toLowerCase().includes(name)) return coops[k]
    return 0
  }

  return {
    employeeId: p.staffIdCode ?? '',
    contractStaffId: '',
    name: p.staffName ?? '',
    approvedRole: ctx.jobTitleMap?.get(p.staffId) ?? '',
    payPoint: ctx.payPointMap?.get(p.staffId) ?? '',
    state: ctx.stateMap?.get(p.staffId) ?? '',
    grade: p.gradeName ?? '',
    level: '',
    initialGrossPay,
    basic: toNum(p.basicSalary),
    housing: toNum(p.housingAllowance),
    transport: toNum(p.transportAllowance),
    furniture: toNum(p.furnitureAllowance),
    domestic: toNum(p.domesticAllowance),
    meal: toNum(p.mealSubsidy),
    hazard: toNum(p.hazardAllowance),
    electricity: toNum(p.electricityAllowance),
    otherAllowances: toNum(p.otherAllowances),
    discretionary: toNum(p.discoveryAllowance),
    carSubsidy: toNum(p.carSubsidy),
    entertainment: toNum(p.entertainmentAllowance),
    dataAllowance: toNum(p.dataAllowance),
    nightAllowance: toNum(p.nightAllowance),
    overtime: toNum(p.overtimeEarnings),
    arrears: toNum(p.arrears),
    grossPay: toNum(p.grossSalary),
    reimbursement: 0,
    lifeAssurance: toNum(p.lifeAssuranceAmount),
    nhf: toNum(p.nhf),
    pensionEmployee: toNum(p.pensionEmployee),
    voluntaryPension: toNum(p.voluntaryPension),
    insurance: toNum(p.insurance),
    paye: toNum(p.monthlyPAYE),
    cashAdvanced: toNum(p.cashAdvanced),
    loan: toNum(p.loan),
    domesticLoan: toNum(p.domesticLoan),
    nuee: r2(ctx.unionMap?.get(p.staffId) ?? 0),
    ssaeac: r2(ctx.ssaeacMap?.get(p.staffId) ?? 0),
    devptLevy: 0,
    phZonalThrift: r2(coopAmt('zonal thrift')),
    nsmpcsuyo: r2(coopAmt('nsmpcsuyo')),
    nemscoopcal: r2(coopAmt('nemscoopcal')),
    nemscoopuyo: r2(coopAmt('nemscoopuyo')),
    dedLiabilities: toNum(p.deductionLiabilities),
    nepascoopcal: r2(coopAmt('nepascoopcal')),
    nepascoopiko: r2(coopAmt('nepascoopiko')),
    nepascoopphc: r2(coopAmt('nepascoopphc')),
    nepascoopuyo: r2(coopAmt('nepascoopuyo')),
    ielCredit: r2(coopAmt('iel credit')),
    phedStaffCoop: r2(coopAmt('phed staff')),
    totalDeduction: toNum(p.totalDeductions),
    netPay: toNum(p.netSalary),
    pensionEmployer: toNum(p.pensionEmployer),
    salaryCost: r2(toNum(p.grossSalary) + toNum(p.pensionEmployer)),
    rentRelief: toNum(p.annualRentRelief),
    totalAllowableDeduction: r2(Math.max(0, annualGross - annualChargeable)),
    totalTaxableIncome: annualGross,
    band1: bands[0], band2: bands[1], band3: bands[2], band4: bands[3], band5: bands[4], band6: bands[5],
    payeAnnual: toNum(p.annualPAYE),
    totalGrossPay: toNum(p.grossSalary),   // = Gross + EROBREA (EROBREA = 0)
    totalNetPay: toNum(p.netSalary),       // = Net + EROBREA
  }
}

function sheet(name: string, cols: { key: string; header: string; type: 'text' | 'currency' | 'integer' | 'number'; width?: number }[], rows: Record<string, any>[]): CostCentreSheet {
  return { name, columns: cols, rows }
}

// Resolve per-staff union/cooperative amounts to the reference's fixed columns
// (NUEE, SSAEAC, PH Zonal Thrift, NEPASCOOP…, IEL, PHED Staff Coop) by name.
export function buildUnionCoopMaps(
  unions:      { id: string; name: string; percentage: number }[],
  coops:       { id: string; name: string }[],
  staffUnions: { staffId: string; unionId: string }[],
  staffCoops:  { staffId: string; cooperativeId: string; totalAmount: any }[],
  payrolls:    Payroll[],
): { unionMap: Map<string, number>; ssaeacMap: Map<string, number>; coopMap: Map<string, Record<string, number>> } {
  const grossByStaff = new Map<string, number>(payrolls.map(r => [r.staffId, toNum(r.grossSalary)]))
  const nueeUnion   = unions.find(u => /nuee/i.test(u.name))
  const ssaeacUnion = unions.find(u => /ssaeac/i.test(u.name))
  const unionMap = new Map<string, number>()
  const ssaeacMap = new Map<string, number>()
  for (const su of staffUnions) {
    const gross = grossByStaff.get(su.staffId) ?? 0
    if (nueeUnion && su.unionId === nueeUnion.id) unionMap.set(su.staffId, r2(gross * nueeUnion.percentage))
    if (ssaeacUnion && su.unionId === ssaeacUnion.id) ssaeacMap.set(su.staffId, r2(gross * ssaeacUnion.percentage))
  }
  const coopMap = new Map<string, Record<string, number>>()
  for (const sc of staffCoops) {
    const coop = coops.find(c => c.id === sc.cooperativeId)
    if (!coop) continue
    const amount = toNum(sc.totalAmount)
    if (!coopMap.has(sc.staffId)) coopMap.set(sc.staffId, {})
    coopMap.get(sc.staffId)![coop.name] = r2(amount)
  }
  return { unionMap, ssaeacMap, coopMap }
}

// Resolve each PHED staff member's state of residence from the core module's
// EmployeeTaxProfile (StaffRecord.taxProfile.stateOfResidence), matched by
// employee ID first, then email. Returns a map keyed by PhedStaff.id.
export async function fetchStateOfResidenceMap(prisma: any, companyId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const [phedStaff, staffRecords] = await Promise.all([
    prisma.phedStaff.findMany({ where: { companyId }, select: { id: true, staffId: true, email: true } }),
    prisma.staffRecord.findMany({
      where: { companyId },
      select: { staffId: true, email: true, taxProfile: { select: { stateOfResidence: true } } },
    }),
  ])
  const byStaffId = new Map<string, string>()
  const byEmail = new Map<string, string>()
  for (const sr of staffRecords) {
    const st = sr.taxProfile?.stateOfResidence
    if (!st) continue
    if (sr.staffId) byStaffId.set(sr.staffId.toLowerCase(), st)
    if (sr.email) byEmail.set(sr.email.toLowerCase(), st)
  }
  for (const ps of phedStaff) {
    const st = (ps.staffId ? byStaffId.get(ps.staffId.toLowerCase()) : undefined)
      ?? (ps.email ? byEmail.get(ps.email.toLowerCase()) : undefined)
    if (st) map.set(ps.id, st)
  }
  return map
}

// ── Statutory schedule sheet builders (reference-exact columns) ──

function earningsCols(): { key: string; header: string; type: 'currency'; width: number }[] {
  return [
    { key: 'initialGrossPay', header: 'Initial Gross Pay', type: 'currency', width: 16 },
    { key: 'basic', header: 'Basic', type: 'currency', width: 14 },
    { key: 'housing', header: 'Housing Allow', type: 'currency', width: 14 },
    { key: 'transport', header: 'Transport Allow', type: 'currency', width: 16 },
    { key: 'furniture', header: 'Furniture', type: 'currency', width: 12 },
    { key: 'domestic', header: 'Domestic', type: 'currency', width: 12 },
    { key: 'meal', header: 'Meal', type: 'currency', width: 12 },
    { key: 'hazard', header: 'Hazard', type: 'currency', width: 12 },
    { key: 'electricity', header: 'Electricity', type: 'currency', width: 12 },
    { key: 'otherAllowances', header: 'Other Allowances', type: 'currency', width: 14 },
    { key: 'discretionary', header: 'Discretionary Allowances', type: 'currency', width: 16 },
    { key: 'carSubsidy', header: 'Car Subsidy', type: 'currency', width: 12 },
    { key: 'entertainment', header: 'Entertainment', type: 'currency', width: 14 },
    { key: 'dataAllowance', header: 'Data Allowance', type: 'currency', width: 14 },
    { key: 'nightAllowance', header: 'Night Allowance', type: 'currency', width: 14 },
    { key: 'overtime', header: 'Overtime', type: 'currency', width: 12 },
    { key: 'arrears', header: 'Arrears', type: 'currency', width: 12 },
  ]
}

function statBase(name: string, amountKey: string, amountHeader: string, rows: Record<string, any>[], withState = false): CostCentreSheet {
  const cols = [
    { key: 'employeeId', header: 'Employee ID', type: 'text' as const, width: 16 },
    { key: 'name', header: 'Name', type: 'text' as const, width: 26 },
    ...earningsCols(),
    { key: 'grossPay', header: 'Gross Pay', type: 'currency' as const, width: 16 },
  ]
  if (withState) cols.push({ key: 'state', header: 'State', type: 'text' as const, width: 16 })
  cols.push({ key: amountKey, header: amountHeader, type: 'currency' as const, width: 20 })
  return sheet(name, cols, rows)
}

export function buildBankSheet(name: string, rows: Payroll[]): CostCentreSheet {
  return sheet(name, [
    { key: 'employeeId', header: 'Employee ID', type: 'text', width: 16 },
    { key: 'name', header: 'Name', type: 'text', width: 26 },
    { key: 'bankName', header: 'Bank', type: 'text', width: 22 },
    { key: 'accountNumber', header: 'Account Number', type: 'text', width: 18 },
    { key: 'netPay', header: 'Total Net Pay', type: 'currency', width: 18 },
  ], rows.filter(r => r.paymentStatus === 'ACTIVE').map(r => ({
    employeeId: r.staffIdCode ?? '', name: r.staffName ?? '',
    bankName: r.bankName ?? '', accountNumber: r.accountNumber ?? '', netPay: toNum(r.netSalary),
  })))
}

export function buildWithheldSheet(name: string, rows: Payroll[]): CostCentreSheet {
  return sheet(name, [
    { key: 'employeeId', header: 'Employee ID', type: 'text', width: 16 },
    { key: 'name', header: 'Name', type: 'text', width: 26 },
    { key: 'bankName', header: 'Bank', type: 'text', width: 22 },
    { key: 'accountNumber', header: 'Account Number', type: 'text', width: 18 },
    { key: 'netPay', header: 'Total Net Pay', type: 'currency', width: 18 },
    { key: 'remark', header: 'Remark', type: 'text', width: 24 },
  ], rows.filter(r => r.paymentStatus === 'WITHHELD').map(r => ({
    employeeId: r.staffIdCode ?? '', name: r.staffName ?? '',
    bankName: r.bankName ?? '', accountNumber: r.accountNumber ?? '',
    netPay: toNum(r.netSalary), remark: r.withheldReason ?? '',
  })))
}

export function buildPensionSheet(name: string, rows: Payroll[], includeVoluntary: boolean): CostCentreSheet {
  const cols = [
    { key: 'employeeId', header: 'Employee ID', type: 'text' as const, width: 16 },
    { key: 'name', header: 'Name', type: 'text' as const, width: 26 },
    { key: 'pfa', header: 'PFA', type: 'text' as const, width: 22 },
    { key: 'rsaPin', header: 'RSA_PIN', type: 'text' as const, width: 18 },
    { key: 'pensionEmployee', header: "Employee's Pension Contribution", type: 'currency' as const, width: 18 },
  ]
  if (includeVoluntary) cols.push({ key: 'voluntaryPension', header: 'Voluntary Pension', type: 'currency' as const, width: 16 })
  cols.push(
    { key: 'pensionEmployer', header: "Employer's Pension Contribution", type: 'currency' as const, width: 18 },
    { key: 'totalPension', header: 'Total Pension Contribution', type: 'currency' as const, width: 18 },
  )
  return sheet(name, cols, rows.filter(r => r.paymentStatus === 'ACTIVE').map(r => ({
    employeeId: r.staffIdCode ?? '', name: r.staffName ?? '', pfa: r.pfaName ?? '', rsaPin: r.rsaPin ?? '',
    pensionEmployee: toNum(r.pensionEmployee), voluntaryPension: toNum(r.voluntaryPension),
    pensionEmployer: toNum(r.pensionEmployer),
    totalPension: r2(toNum(r.pensionEmployee) + toNum(r.voluntaryPension) + toNum(r.pensionEmployer)),
  })))
}

export function buildStatutorySheet(name: string, kind: 'nsitf' | 'itf' | 'nhf' | 'paye', rows: Payroll[], ctx: RegisterCtx = {}): CostCentreSheet {
  const amountHeader = kind === 'nsitf' ? 'NSITF Remittance (1% of Gross Pay)'
    : kind === 'itf' ? 'ITF Remittance (1% of Gross Pay)'
    : kind === 'nhf' ? 'NHF' : 'PAYE'
  const list = rows.filter(r => r.paymentStatus === 'ACTIVE').map(r => {
    const reg = mapRegisterRow(r, ctx)
    const amount = kind === 'nsitf' ? r2(toNum(r.grossSalary) * 0.01)
      : kind === 'itf' ? r2(toNum(r.grossSalary) * 0.01)
      : kind === 'nhf' ? toNum(r.nhf)
      : toNum(r.monthlyPAYE)
    return { ...reg, amount }
  })
  return statBase(name, 'amount', amountHeader, list, kind === 'paye')
}

export function buildInsuranceSheet(name: string, rows: Payroll[]): CostCentreSheet {
  return sheet(name, [
    { key: 'employeeId', header: 'Employee ID', type: 'text', width: 16 },
    { key: 'name', header: 'Name', type: 'text', width: 26 },
    { key: 'insuranceName', header: 'Insurance Name', type: 'text', width: 22 },
    { key: 'policyNumber', header: 'Policy Number', type: 'text', width: 18 },
    { key: 'insurance', header: "Employee's Contribution", type: 'currency', width: 18 },
  ], rows.filter(r => r.paymentStatus === 'ACTIVE' && toNum(r.insurance) > 0).map(r => ({
    employeeId: r.staffIdCode ?? '', name: r.staffName ?? '', insuranceName: '', policyNumber: '',
    insurance: toNum(r.insurance),
  })))
}

export function buildUnionCoopSheet(name: string, rows: Payroll[], ctx: RegisterCtx = {}): CostCentreSheet {
  return sheet(name, [
    { key: 'employeeId', header: 'Employee ID', type: 'text', width: 16 },
    { key: 'name', header: 'Name', type: 'text', width: 26 },
    { key: 'nuee', header: 'NUEE Check-off dues', type: 'currency', width: 18 },
    { key: 'ssaeac', header: 'SSAEAC Check-off Dues', type: 'currency', width: 18 },
    { key: 'phZonalThrift', header: 'PH Zonal Thrift', type: 'currency', width: 16 },
    { key: 'dedLiabilities', header: 'DED/LIABILITIES', type: 'currency', width: 16 },
    { key: 'nepascoopuyo', header: 'NEPASCOOPUYO', type: 'currency', width: 16 },
    { key: 'ielCredit', header: 'IEL CREDIT & INVESTMENT COOP', type: 'currency', width: 22 },
    { key: 'phedStaffCoop', header: 'PHED Staff Cooperative', type: 'currency', width: 20 },
  ], rows.filter(r => r.paymentStatus === 'ACTIVE').map(r => mapRegisterRow(r, ctx)))
}

// ── Full "Payroll 1 (Regular)" workbook ──
export function buildRegularWorkbook(labels: PeriodLabels, rows: Payroll[], ctx: RegisterCtx = {}): CostCentreSheet[] {
  return [
    sheet(`${labels.monthYear} Payroll`, REGISTER_COLS, rows.map(r => mapRegisterRow(r, ctx))),
    buildBankSheet(`Bank_${labels.apostrophe}`, rows),
    buildWithheldSheet('Withheld Salaries', rows),
    buildPensionSheet(`Pension_${labels.apostrophe}`, rows, true),
    buildStatutorySheet(`NSITF_${labels.apostrophe}`, 'nsitf', rows, ctx),
    buildStatutorySheet(`ITF_${labels.apostrophe}`, 'itf', rows, ctx),
    buildStatutorySheet(`PAYE_${labels.apostrophe}`, 'paye', rows, ctx),
    buildInsuranceSheet(`Insurance_${labels.apostrophe}`, rows),
    buildStatutorySheet(`NHF_${labels.apostrophe}`, 'nhf', rows, ctx),
    buildUnionCoopSheet(`Union_Coopera_${labels.apostrophe}`, rows, ctx),
  ]
}

// ── "Payroll 2 (Contract Staff)" workbook ──
export function buildContractWorkbook(labels: PeriodLabels, contract: Payroll[], nysc: Payroll[], ctx: RegisterCtx = {}): CostCentreSheet[] {
  return [
    sheet(`NYSC_IT - ${labels.monthSpace}`, [
      { key: 'employeeId', header: 'Empl. ID', type: 'text', width: 14 },
      { key: 'sn', header: 'S/N', type: 'integer', width: 8 },
      { key: 'name', header: 'NAME', type: 'text', width: 26 },
      { key: 'location', header: 'LOCATION', type: 'text', width: 16 },
      { key: 'department', header: 'Department', type: 'text', width: 20 },
      { key: 'internshipType', header: 'Internship Type', type: 'text', width: 16 },
      { key: 'stateCode', header: 'State Code', type: 'text', width: 12 },
      { key: 'effectiveDate', header: 'EFFECTIVE DATE', type: 'text', width: 14 },
      { key: 'endDate', header: 'END DATE', type: 'text', width: 14 },
      { key: 'monthlyGross', header: 'MONTHLY GROSS  (₦)', type: 'currency', width: 16 },
      { key: 'arrears', header: 'Arrears', type: 'currency', width: 12 },
      { key: 'daysAbsent', header: 'Days Absent', type: 'integer', width: 12 },
      { key: 'absenteeism', header: 'Absenteeism', type: 'currency', width: 12 },
      { key: 'allowance', header: `${labels.monthShort} ${labels.yy}  Allowance`, type: 'currency', width: 16 },
    ], nysc.map((r, i) => ({
      employeeId: r.staffIdCode ?? '', sn: i + 1, name: r.staffName ?? '', location: r.regionName ?? '',
      department: r.department ?? '', internshipType: '', stateCode: '', effectiveDate: '', endDate: '',
      monthlyGross: toNum(r.grossSalary), arrears: toNum(r.arrears), daysAbsent: 0, absenteeism: 0,
      allowance: toNum(r.netSalary),
    }))),
    sheet(`Contract Staff_${labels.space}`, REGISTER_COLS, contract.map(r => mapRegisterRow(r, ctx))),
    buildBankSheet(`Contr. Bank_${labels.dot}`, contract),
    buildWithheldSheet('Withheld Salaries', contract),
    buildPensionSheet(`Contr. Pension_${labels.dot}`, contract, false),
    buildStatutorySheet(`Contr. PAYE_${labels.dot}`, 'paye', contract, ctx),
    buildStatutorySheet(`Contract Staff_NSITF_${labels.apostrophe}`, 'nsitf', contract, ctx),
    buildStatutorySheet(`Contract Staff_ITF_${labels.apostrophe}`, 'itf', contract, ctx),
  ]
}

// ── "Individual Report" (DATA Template) ──
export function buildIndividualWorkbook(rows: Payroll[], ctx: RegisterCtx = {}): CostCentreSheet[] {
  return [sheet('DATA Template', REGISTER_COLS, rows.map(r => mapRegisterRow(r, ctx)))]
}

// ── "Summary" workbook (Payroll Summary + Memo Summary + Breakdown of PAYE) ──
interface CategoryAgg {
  label: string
  headCount: number
  grossPay: number
  pensionEmployer: number
  nsitf: number
  itf: number
  totalPayrollCost: number
  netPay: number
  pensionRemittance: number
  nhf: number
  paye: number
  insurance: number
  loan: number
  liabilities: number
}

function categoryAgg(payrolls: Payroll[], category: string, label: string): CategoryAgg {
  const members = payrolls.filter(r => r.category === category)
  const gross = members.reduce((s, r) => s + toNum(r.grossSalary), 0)
  const statutory = category !== 'NYSC_IT'
  const pensionEmployer = statutory ? members.reduce((s, r) => s + toNum(r.pensionEmployer), 0) : 0
  const nsitf = statutory ? r2(gross * 0.01) : 0
  const itf = statutory ? r2(gross * 0.01) : 0
  return {
    label, headCount: members.length, grossPay: r2(gross), pensionEmployer: r2(pensionEmployer),
    nsitf, itf, totalPayrollCost: r2(gross + pensionEmployer + nsitf + itf),
    netPay: r2(members.reduce((s, r) => s + toNum(r.netSalary), 0)),
    pensionRemittance: r2(members.reduce((s, r) => s + toNum(r.pensionEmployee) + toNum(r.pensionEmployer), 0)),
    nhf: r2(members.reduce((s, r) => s + toNum(r.nhf), 0)),
    paye: r2(members.reduce((s, r) => s + toNum(r.monthlyPAYE), 0)),
    insurance: r2(members.reduce((s, r) => s + toNum(r.insurance), 0)),
    loan: r2(members.reduce((s, r) => s + toNum(r.loan) + toNum(r.domesticLoan), 0)),
    liabilities: r2(members.reduce((s, r) => s + toNum(r.deductionLiabilities), 0)),
  }
}

const SUMMARY_COLS = [
  { key: 'label', header: 'Payroll', type: 'text' as const, width: 18 },
  { key: 'headCount', header: 'No. of Employee', type: 'integer' as const, width: 14 },
  { key: 'grossPay', header: 'Gross Pay', type: 'currency' as const, width: 18 },
  { key: 'pensionEmployer', header: "Employer's Pension Contribution", type: 'currency' as const, width: 18 },
  { key: 'nsitf', header: 'NSITF', type: 'currency' as const, width: 14 },
  { key: 'itf', header: 'ITF', type: 'currency' as const, width: 14 },
  { key: 'totalPayrollCost', header: 'Total Payroll Cost', type: 'currency' as const, width: 18 },
  { key: 'netPay', header: 'Net Pay', type: 'currency' as const, width: 16 },
  { key: 'pensionRemittance', header: 'Total Pension Remittance', type: 'currency' as const, width: 18 },
  { key: 'nhf', header: 'NHF', type: 'currency' as const, width: 14 },
  { key: 'paye', header: 'PAYE', type: 'currency' as const, width: 14 },
  { key: 'insurance', header: 'Insurance', type: 'currency' as const, width: 14 },
  { key: 'loan', header: 'Loan', type: 'currency' as const, width: 14 },
  { key: 'liabilities', header: 'DED/LIABILITIES', type: 'currency' as const, width: 16 },
]

function sumAggs(aggs: CategoryAgg[]): CategoryAgg {
  const z: CategoryAgg = { label: 'Total', headCount: 0, grossPay: 0, pensionEmployer: 0, nsitf: 0, itf: 0, totalPayrollCost: 0, netPay: 0, pensionRemittance: 0, nhf: 0, paye: 0, insurance: 0, loan: 0, liabilities: 0 }
  for (const a of aggs) {
    z.headCount += a.headCount; z.grossPay = r2(z.grossPay + a.grossPay); z.pensionEmployer = r2(z.pensionEmployer + a.pensionEmployer)
    z.nsitf = r2(z.nsitf + a.nsitf); z.itf = r2(z.itf + a.itf); z.totalPayrollCost = r2(z.totalPayrollCost + a.totalPayrollCost)
    z.netPay = r2(z.netPay + a.netPay); z.pensionRemittance = r2(z.pensionRemittance + a.pensionRemittance)
    z.nhf = r2(z.nhf + a.nhf); z.paye = r2(z.paye + a.paye); z.insurance = r2(z.insurance + a.insurance)
    z.loan = r2(z.loan + a.loan); z.liabilities = r2(z.liabilities + a.liabilities)
  }
  return z
}

export function buildSummaryWorkbook(labels: PeriodLabels, payrolls: Payroll[], stateMap: Map<string, string> = new Map()): CostCentreSheet[] {
  const regular = categoryAgg(payrolls, 'REGULAR', 'Regular Staff')
  const contract = categoryAgg(payrolls, 'CONTRACT', 'Contract Staff')
  const nysc = categoryAgg(payrolls, 'NYSC_IT', 'NYSC & IT')
  const total = sumAggs([regular, contract, nysc])

  const summarySheet = sheet(`${labels.monthYear} Payroll Summary`, SUMMARY_COLS, [regular, contract, nysc, total])

  const memoSheet = sheet('Memo Summary', [
    { key: 'item', header: 'Description', type: 'text', width: 40 },
    { key: 'amount', header: 'Amount', type: 'currency', width: 20 },
  ], [
    { item: 'A. Total Payroll Cost', amount: null },
    { item: '  Regular Staff', amount: regular.totalPayrollCost },
    { item: '  Contract Staff', amount: contract.totalPayrollCost },
    { item: '  NYSC/Internship', amount: nysc.grossPay },
    { item: '  Total', amount: r2(regular.totalPayrollCost + contract.totalPayrollCost + nysc.grossPay) },
    { item: 'B. Deductions and Remittances', amount: null },
    { item: '  Pension Remittance', amount: total.pensionRemittance },
    { item: '  NSITF', amount: total.nsitf },
    { item: '  ITF', amount: total.itf },
    { item: '  NHF', amount: total.nhf },
    { item: '  PAYE', amount: total.paye },
    { item: '  Insurance', amount: total.insurance },
    { item: '  Loan', amount: total.loan },
    { item: '  Liabilities to PHED', amount: total.liabilities },
    { item: 'C. Employee’s Net Pay', amount: total.netPay },
  ])

  const states = ['Akwa Ibom', 'Bayelsa', 'Cross River', 'Rivers']
  const stateRows = states.map(s => {
    const inState = payrolls.filter(r => (stateMap.get(r.staffId) ?? '').toLowerCase().includes(s.toLowerCase()))
    return {
      state: `${s} State`,
      regular: r2(inState.filter(r => r.category === 'REGULAR').reduce((sum, r) => sum + toNum(r.monthlyPAYE), 0)),
      contract: r2(inState.filter(r => r.category === 'CONTRACT').reduce((sum, r) => sum + toNum(r.monthlyPAYE), 0)),
    }
  })

  const breakdownSheet = sheet('Breakdown of PAYE', [
    { key: 'state', header: 'State', type: 'text', width: 22 },
    { key: 'regular', header: 'Regular Staff', type: 'currency', width: 16 },
    { key: 'contract', header: 'Contract Staff', type: 'currency', width: 16 },
  ], [
    ...stateRows,
    { state: 'Total', regular: regular.paye, contract: contract.paye },
  ])

  return [summarySheet, memoSheet, breakdownSheet]
}

// ── "Internal Audit" workbook ──
const IAD_CHANGES_DIFF_COLS = [
  { key: 'sn',          header: 'S/N',                type: 'integer'  as const, width: 8  },
  { key: 'employeeId',  header: 'Empl. ID',           type: 'text'     as const, width: 14 },
  { key: 'name',        header: 'Name',               type: 'text'     as const, width: 28 },
  { key: 'prevGross',   header: 'Previous Gross Pay', type: 'currency' as const, width: 18 },
  { key: 'currGross',   header: 'Current Gross Pay',  type: 'currency' as const, width: 18 },
  { key: 'grossChange', header: 'Gross Pay Change',   type: 'currency' as const, width: 18 },
  { key: 'prevNet',     header: 'Previous Net Pay',   type: 'currency' as const, width: 16 },
  { key: 'currNet',     header: 'Current Net Pay',    type: 'currency' as const, width: 16 },
  { key: 'netChange',   header: 'Net Pay Change',     type: 'currency' as const, width: 16 },
]

export function buildIadWorkbook(labels: PeriodLabels, payrolls: Payroll[], previousPayrolls: Payroll[] = []): CostCentreSheet[] {
  const regular = categoryAgg(payrolls, 'REGULAR', 'Regular Staff')
  const contract = categoryAgg(payrolls, 'CONTRACT', 'Contract Staff')
  const nysc = categoryAgg(payrolls, 'NYSC_IT', 'NYSC & IT')
  const total = sumAggs([regular, contract, nysc])

  const summarySheet = sheet(`${labels.shortYear} Summary`, [
    { key: 'label', header: 'Payroll', type: 'text', width: 18 },
    { key: 'headCount', header: 'No. of Employee', type: 'integer', width: 14 },
    { key: 'grossPay', header: 'Gross Pay', type: 'currency', width: 18 },
    { key: 'pensionEmployer', header: "Employer's Pension Contribution", type: 'currency', width: 18 },
    { key: 'nsitf', header: 'NSITF', type: 'currency', width: 14 },
    { key: 'itf', header: 'ITF', type: 'currency', width: 14 },
    { key: 'totalPayrollCost', header: 'Total Payroll Cost', type: 'currency', width: 18 },
  ], [regular, contract, nysc, total])

  // Changes sheet — per-staff pay comparison between the previous period and
  // this one (gross & net with the month-over-month delta). Includes new hires
  // (previous = 0) and exits (current = 0).
  const prevMap = new Map(previousPayrolls.map(r => [r.staffId, r]))
  const currMap = new Map(payrolls.map(r => [r.staffId, r]))
  const newHired = payrolls.filter(r => !prevMap.has(r.staffId))
  const exited   = previousPayrolls.filter(r => !currMap.has(r.staffId))
  const changeRows = [...new Set([...prevMap.keys(), ...currMap.keys()])]
    .map(staffId => {
      const prev = prevMap.get(staffId)
      const curr = currMap.get(staffId)
      const prevGross = toNum(prev?.grossSalary)
      const currGross = toNum(curr?.grossSalary)
      const prevNet   = toNum(prev?.netSalary)
      const currNet   = toNum(curr?.netSalary)
      return {
        employeeId: curr?.staffIdCode ?? prev?.staffIdCode ?? staffId,
        name:       curr?.staffName   ?? prev?.staffName   ?? '',
        prevGross, currGross, grossChange: r2(currGross - prevGross),
        prevNet,   currNet,   netChange:   r2(currNet - prevNet),
      }
    })
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId))
    .map((r, i) => ({ sn: i + 1, ...r }))

  const changesSheet = sheet(`${labels.shortYear} Changes`, IAD_CHANGES_DIFF_COLS, changeRows)
  const newHiredSheet = sheet(`${labels.shortYear} New Hired_Reg`, REGISTER_COLS, newHired.filter(r => r.category === 'REGULAR').map(r => mapRegisterRow(r)))
  const exitedRegSheet = sheet(`${labels.shortYear} Exited_Regular`, REGISTER_COLS, exited.filter(r => r.category === 'REGULAR').map(r => mapRegisterRow(r)))
  const exitedConSheet = sheet(`${labels.shortYear} Exited_Contract`, REGISTER_COLS, exited.filter(r => r.category === 'CONTRACT').map(r => mapRegisterRow(r)))
  const validateSheet = sheet('Validate', REGISTER_COLS, payrolls.map(r => mapRegisterRow(r)))

  return [summarySheet, changesSheet, newHiredSheet, exitedRegSheet, exitedConSheet, validateSheet]
}
