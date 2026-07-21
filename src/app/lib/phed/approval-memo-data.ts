// Builds the Approval Memo's Sections A/B/C (PRD 12.5) for a given pay
// period, by reusing the same payroll-aggregation logic already shipped for
// the Finance Summary report (src/app/lib/phed/reports.ts) — no duplicate
// computation of gross/deduction/net or statutory/union/coop totals.

import { prisma } from '@/app/lib/db'
import { buildFinancePayrollSummary } from '@/app/lib/phed/reports'
import { nairaToWords } from '@/app/lib/phed/currency-words'

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'object' && typeof (v as any).toNumber === 'function') return (v as any).toNumber()
  return Number(v) || 0
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

export interface ApprovalMemoSectionARow {
  label: string // 'Regular Staff' | 'Contract Staff' | 'NYSC/Internship' | 'Total'
  gross: number
  deduction: number
  netPay: number
}

export interface ApprovalMemoSectionBRow {
  label: string
  amount: number
}

export interface ApprovalMemoSections {
  periodName: string
  month: number
  year: number
  companyId: string
  companyName: string
  subject: string // 'Payment of [Month] [Year] Salary'
  sectionA: ApprovalMemoSectionARow[]
  sectionEarnings: ApprovalMemoSectionBRow[] // salary components summing to gross
  sectionB: ApprovalMemoSectionBRow[]
  totalNetPay: number // Section C — equal to Section A's Total row
  approvalSentence: string
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export async function buildApprovalMemoSections(payPeriodId: string): Promise<ApprovalMemoSections> {
  const period = await prisma.phedPayPeriod.findUnique({
    where: { id: payPeriodId },
    select: {
      id: true, periodName: true, month: true, year: true, companyId: true,
      company: { select: { companyName: true } },
    },
  })
  if (!period) throw new Error('Pay period not found')

  const payrolls = await prisma.phedComputedPayroll.findMany({ where: { payPeriodId } })
  const staffIds = payrolls.map(r => r.staffId)

  const [allUnions, allCoops, allDeductions, staffUnions, staffCoops, staffDedLiabilities] =
    await Promise.all([
      prisma.phedUnion.findMany({ where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' } }),
      prisma.phedCooperative.findMany({ where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' } }),
      prisma.phedDeductionLiability.findMany({ where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' } }),
      prisma.phedStaffUnion.findMany({ where: { staffId: { in: staffIds } } }),
      prisma.phedStaffCooperative.findMany({ where: { staffId: { in: staffIds } } }),
      prisma.phedStaffDeductionLiability.findMany({ where: { staffId: { in: staffIds } } }),
    ])

  const finance = buildFinancePayrollSummary(
    payrolls,
    allUnions.map(u => ({ id: u.id, name: u.name, percentage: toNum(u.percentage) })),
    allCoops.map(c => ({ id: c.id, name: c.name })),
    allDeductions.map(d => ({ id: d.id, name: d.name })),
    staffUnions,
    staffCoops,
    staffDedLiabilities,
    period.periodName,
    period.month,
    period.year,
  )

  // ── Section Earnings — Salary Component Breakdown ───────────
  // Shows every non-zero earnings component aggregated across all staff,
  // so approvers can see what makes up the total gross pay.
  const earningsMap: [string, string][] = [
    ['Basic Salary',              'basicSalary'],
    ['Housing Allowance',         'housingAllowance'],
    ['Transport Allowance',       'transportAllowance'],
    ['Furniture Allowance',       'furnitureAllowance'],
    ['Meal Subsidy',              'mealSubsidy'],
    ['Utility Allowance',         'utilityAllowance'],
    ['Leave Grant',               'leaveAllowance'],
    ['Domestic Allowance',        'domesticAllowance'],
    ['Hazard Allowance',          'hazardAllowance'],
    ['Electricity Allowance',     'electricityAllowance'],
    ['Discretionary Allowance',   'discoveryAllowance'],
    ['Car Subsidy',               'carSubsidy'],
    ['Entertainment Allowance',   'entertainmentAllowance'],
    ['Data Allowance',            'dataAllowance'],
    ['Night Allowance',           'nightAllowance'],
    ['Arrears',                   'arrears'],
    ['Other Allowances',          'otherAllowances'],
    ['Overtime',                  'overtimeEarnings'],
  ]
  const sectionEarnings: ApprovalMemoSectionBRow[] = earningsMap
    .map(([label, field]) => ({
      label,
      amount: round2(payrolls.reduce((s, r) => s + toNum((r as any)[field]), 0)),
    }))
    .filter(row => row.amount > 0)
  const totalGross = round2(payrolls.reduce((s, r) => s + toNum(r.grossSalary), 0))
  sectionEarnings.push({ label: 'Total Gross Pay', amount: totalGross })

  // ── Section A — Total Payroll Cost ──────────────────────────
  const LABELS: Record<string, string> = { 'Regular Staff': 'Regular Staff', 'Contract Staff': 'Contract Staff', 'NYSC & IT': 'NYSC/Internship', 'TOTAL': 'Total' }
  const sectionA: ApprovalMemoSectionARow[] = finance.payrollCost.map(row => ({
    label: LABELS[row.label] ?? row.label,
    gross: row.grossPay,
    deduction: round2(row.grossPay - row.netPay),
    netPay: row.netPay,
  }))
  const totalRow = sectionA.find(r => r.label === 'Total')
  const totalNetPay = totalRow?.netPay ?? 0

  // ── Section B — Deductions and Remittances ──────────────────
  const remittanceTotal = finance.remittance.find(r => r.bankName === 'TOTAL')
  const payeTotal = round2(payrolls.reduce((s, r) => s + toNum(r.monthlyPAYE), 0))
  const liabilitiesTotal = round2(
    allDeductions.reduce((s, d) => s + toNum(remittanceTotal?.[`d_${d.id}`] ?? 0), 0),
  )

  const sectionB: ApprovalMemoSectionBRow[] = [
    { label: 'Pension Remittance', amount: toNum(remittanceTotal?.totalPension) },
    { label: 'NSITF', amount: toNum(remittanceTotal?.nsitf) },
    { label: 'ITF', amount: toNum(remittanceTotal?.itf) },
    { label: 'NHF', amount: toNum(remittanceTotal?.nhf) },
    { label: 'PAYE', amount: payeTotal },
    ...allUnions.map(u => ({ label: u.name, amount: toNum(remittanceTotal?.[`u_${u.id}`] ?? 0) })),
    ...allCoops.map(c => ({ label: c.name, amount: toNum(remittanceTotal?.[`c_${c.id}`] ?? 0) })),
    { label: 'Liabilities to PHED', amount: liabilitiesTotal },
  ]
  sectionB.push({ label: 'Total', amount: round2(sectionB.reduce((s, r) => s + r.amount, 0)) })

  const words = nairaToWords(totalNetPay)
  const monthName = MONTH_NAMES[(period.month - 1 + 12) % 12]
  const subject = `Payment of ${monthName} ${period.year} Salary`
  const approvalSentence =
    `We request your approval for payment of N${totalNetPay.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ` +
    `(${words.full}) as ${monthName} ${period.year} salary.`

  return {
    periodName: period.periodName,
    month: period.month,
    year: period.year,
    companyId: period.companyId,
    companyName: period.company?.companyName ?? '',
    subject,
    sectionA,
    sectionEarnings,
    sectionB,
    totalNetPay,
    approvalSentence,
  }
}
