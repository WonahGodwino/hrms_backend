// src/app/lib/staff-loans-benefits/staff-finance.ts
// DB-touching resolvers used by eligibility/simulation — kept separate from
// calculators.ts (pure math) since these hit Prisma.
import { prisma } from '@/app/lib/db'

function normalizeSection(section: unknown): string {
  return String(section || '')
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
}

function isTaggedNetField(key: string, field: { section?: unknown; value?: unknown }): boolean {
  const section = normalizeSection(field.section)
  const keyLower = key.toLowerCase()
  return (
    section === 'NET' ||
    keyLower === 'net_salary' ||
    keyLower === 'take_home' ||
    keyLower === 'net_pay' ||
    keyLower.includes('net_salary') ||
    keyLower.includes('take_home')
  )
}

// Payroll Generation (and dynamic templates) store line items in customFields
// under EARNINGS / DEDUCTIONS — there is no NET section, and the Payroll.netSalary
// column is often left empty. Reconstruct take-home the same way the payslip does.
function netFromCustomFields(customFields: unknown): number {
  if (!customFields || typeof customFields !== 'object') return 0
  const cf = customFields as Record<string, any>
  let taggedNet = 0
  let earnings = 0
  let deductions = 0

  for (const key of Object.keys(cf)) {
    const field = cf[key]
    if (!field || typeof field !== 'object' || !('value' in field)) continue
    const val = Number(field.value)
    if (Number.isNaN(val)) continue

    if (val > 0 && isTaggedNetField(key, field)) {
      taggedNet = val
      break
    }

    const section = normalizeSection(field.section)
    if (section === 'FIXED_EARNINGS' || section === 'EARNINGS') earnings += val
    else if (section === 'DEDUCTIONS') deductions += val
  }

  if (taggedNet > 0) return taggedNet
  const computed = Math.round((earnings - deductions) * 100) / 100
  return computed > 0 ? computed : 0
}

function netFromPayrollRow(p: {
  netSalary: unknown
  grossPay: unknown
  customFields: unknown
  payslips?: { netPay: unknown }[]
}): number {
  const columnNet = Number(p.netSalary || 0)
  if (columnNet > 0) return columnNet

  const fromCustom = netFromCustomFields(p.customFields)
  if (fromCustom > 0) return fromCustom

  const payslipNet = Number(p.payslips?.[0]?.netPay || 0)
  if (payslipNet > 0) return payslipNet

  return Number(p.grossPay || 0)
}

async function resolveNetFromCompensationProfile(staffId: string): Promise<number> {
  const profile = await prisma.staffPayrollProfile.findUnique({
    where: { staffId },
    select: { values: true },
  })
  return netFromCustomFields(profile?.values)
}

function isTaggedGrossField(key: string, field: { section?: unknown; value?: unknown }): boolean {
  const section = normalizeSection(field.section)
  const keyLower = key.toLowerCase()
  return (
    section === 'GROSS' ||
    keyLower === 'gross_pay' ||
    keyLower === 'gross_salary' ||
    keyLower === 'total_gross' ||
    keyLower.includes('gross_salary') ||
    keyLower.includes('gross_pay')
  )
}

function grossFromCustomFields(customFields: unknown): number {
  if (!customFields || typeof customFields !== 'object') return 0
  const cf = customFields as Record<string, any>
  let taggedGross = 0
  let earnings = 0

  for (const key of Object.keys(cf)) {
    const field = cf[key]
    if (!field || typeof field !== 'object' || !('value' in field)) continue
    const val = Number(field.value)
    if (Number.isNaN(val)) continue

    if (val > 0 && isTaggedGrossField(key, field)) {
      taggedGross = val
      break
    }

    const section = normalizeSection(field.section)
    if (section === 'FIXED_EARNINGS' || section === 'EARNINGS' || section === 'ALLOWANCES' || section === 'BASIC') {
      earnings += val
    }
  }

  if (taggedGross > 0) return taggedGross
  return earnings > 0 ? Math.round(earnings * 100) / 100 : 0
}

function grossFromPayrollRow(p: {
  grossPay: unknown
  customFields: unknown
  payslips?: { grossPay: unknown }[]
}): number {
  const columnGross = Number(p.grossPay || 0)
  if (columnGross > 0) return columnGross

  const fromCustom = grossFromCustomFields(p.customFields)
  if (fromCustom > 0) return fromCustom

  const payslipGross = Number(p.payslips?.[0]?.grossPay || 0)
  if (payslipGross > 0) return payslipGross

  return 0
}

async function resolveGrossFromCompensationProfile(staffId: string): Promise<number> {
  const profile = await prisma.staffPayrollProfile.findUnique({
    where: { staffId },
    select: { values: true },
  })
  return grossFromCustomFields(profile?.values)
}

// Resolves a staff member's most recent processed gross salary / previous pay-period gross, handling:
// - Payroll.grossPay column
// - CustomFields line items under EARNINGS / FIXED_EARNINGS / BASIC / ALLOWANCES
// - Payslip.grossPay
// - StaffPayrollProfile as fallback
export async function resolveStaffGrossSalary(staffId: string): Promise<number> {
  const latestPayPeriod = await prisma.payroll.findFirst({
    where: { staffRecordId: staffId, status: 'PROCESSED' },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    select: { year: true, month: true },
  })
  if (!latestPayPeriod) return resolveGrossFromCompensationProfile(staffId)

  const monthPayrolls = await prisma.payroll.findMany({
    where: { staffRecordId: staffId, status: 'PROCESSED', year: latestPayPeriod.year, month: latestPayPeriod.month },
    select: {
      grossPay: true,
      customFields: true,
      payslips: { select: { grossPay: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })

  const totalGross = monthPayrolls.reduce((sum, p) => sum + grossFromPayrollRow(p), 0)
  if (totalGross > 0) return totalGross

  return resolveGrossFromCompensationProfile(staffId)
}

// Resolves a staff member's most recent processed net salary, handling:
// - ISURF_STANDARD (netSalary column)
// - Payroll Generation / dynamic templates (earnings − deductions in customFields,
//   or Payslip.netPay — generation historically did not write Payroll.netSalary)
// - StaffPayrollProfile as a last resort when no processed payroll exists
export async function resolveStaffNetSalary(staffId: string): Promise<number> {
  const latestPayPeriod = await prisma.payroll.findFirst({
    where: { staffRecordId: staffId, status: 'PROCESSED' },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    select: { year: true, month: true },
  })
  if (!latestPayPeriod) return resolveNetFromCompensationProfile(staffId)

  const monthPayrolls = await prisma.payroll.findMany({
    where: { staffRecordId: staffId, status: 'PROCESSED', year: latestPayPeriod.year, month: latestPayPeriod.month },
    select: {
      netSalary: true,
      grossPay: true,
      customFields: true,
      payslips: { select: { netPay: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })

  const totalNet = monthPayrolls.reduce((sum, p) => sum + netFromPayrollRow(p), 0)
  if (totalNet > 0) return totalNet

  return resolveNetFromCompensationProfile(staffId)
}

export async function resolveMonthsEmployed(staffId: string): Promise<number> {
  const staff = await prisma.staffRecord.findUnique({ where: { id: staffId }, select: { hireDate: true, createdAt: true } })
  if (!staff) return 0
  const start = staff.hireDate || staff.createdAt
  const months = (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  return Math.max(0, Math.floor(months))
}

// Sum of monthly repayments across this staff member's other currently
// active (disbursed, not yet repaid/defaulted/cancelled) loans — used for
// debt-ratio eligibility checks.
export async function resolveExistingMonthlyDebt(staffId: string, excludeLoanRequestId?: string): Promise<number> {
  const active = await prisma.loanRequest.findMany({
    where: {
      staffId,
      status: 'DISBURSED',
      ...(excludeLoanRequestId ? { id: { not: excludeLoanRequestId } } : {}),
    },
    select: { monthlyRepayment: true },
  })
  return active.reduce((sum, l) => sum + Number(l.monthlyRepayment || 0), 0)
}
