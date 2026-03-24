/**
 * Payroll Reports Service
 * Generates various payroll reports and schedules
 */

import { prisma } from '@/app/lib/db'
import { PaymentStatus, Prisma } from '@prisma/client'
import * as XLSX from 'xlsx'
import {
  BankScheduleEntry,
  WithheldScheduleEntry,
  PAYEScheduleEntry,
  PensionScheduleEntry,
  NHFScheduleEntry,
  ITFNSITFSchedule,
  CostCentreEntry,
  ReportType,
} from './types'

// Helper to convert Prisma Decimal to number
const toNumber = (val: Prisma.Decimal | number | null | undefined): number => {
  if (val === null || val === undefined) return 0
  return typeof val === 'number' ? val : Number(val)
}

/**
 * Generate Bank Schedule (for direct bank upload)
 * Active payslips only
 */
export async function generateBankSchedule(
  payPeriodId: string,
  companyId: string
): Promise<BankScheduleEntry[]> {
  const payslips = await prisma.computedPayslip.findMany({
    where: {
      payPeriodId,
      companyId,
      paymentStatus: PaymentStatus.ACTIVE,
    },
    orderBy: { employeeName: 'asc' },
  })

  return payslips.map((p, index) => ({
    sn: index + 1,
    employeeName: p.employeeName || '',
    bankName: p.bankName,
    accountNumber: p.accountNumber,
    accountName: p.accountName,
    netSalary: toNumber(p.netSalary),
  }))
}

/**
 * Generate Withheld Salaries Schedule
 */
export async function generateWithheldSchedule(
  payPeriodId: string,
  companyId: string
): Promise<WithheldScheduleEntry[]> {
  const payslips = await prisma.computedPayslip.findMany({
    where: {
      payPeriodId,
      companyId,
      paymentStatus: PaymentStatus.WITHHELD,
    },
    orderBy: { employeeName: 'asc' },
  })

  return payslips.map((p, index) => ({
    sn: index + 1,
    employeeName: p.employeeName || '',
    department: p.departmentName,
    grossSalary: toNumber(p.grossSalary),
    netSalary: toNumber(p.netSalary),
    reason: p.withheldReason,
  }))
}

/**
 * Generate PAYE Schedule (for FIRS/LIRS)
 */
export async function generatePAYESchedule(
  payPeriodId: string,
  companyId: string
): Promise<PAYEScheduleEntry[]> {
  const payslips = await prisma.computedPayslip.findMany({
    where: {
      payPeriodId,
      companyId,
      paymentStatus: PaymentStatus.ACTIVE,
    },
    orderBy: { employeeName: 'asc' },
  })

  return payslips.map((p, index) => ({
    sn: index + 1,
    employeeName: p.employeeName || '',
    annualGrossIncome: toNumber(p.annualGrossIncome),
    consolidatedRelief: toNumber(p.consolidatedReliefAllowance),
    rentRelief: toNumber(p.rentRelief),
    chargeableIncome: toNumber(p.annualChargeableIncome),
    annualPAYE: toNumber(p.annualPAYE),
    monthlyPAYE: toNumber(p.monthlyPAYE),
  }))
}

/**
 * Generate Pension Schedule (PFA format)
 */
export async function generatePensionSchedule(
  payPeriodId: string,
  companyId: string
): Promise<PensionScheduleEntry[]> {
  const payslips = await prisma.computedPayslip.findMany({
    where: {
      payPeriodId,
      companyId,
      paymentStatus: PaymentStatus.ACTIVE,
    },
    orderBy: { employeeName: 'asc' },
  })

  return payslips.map((p, index) => ({
    sn: index + 1,
    employeeName: p.employeeName || '',
    rsaPin: p.pensionPin,
    pfaName: p.pensionFundAdministrator,
    employeeContribution: toNumber(p.pensionEmployee),
    employerContribution: toNumber(p.pensionEmployer),
    totalContribution: toNumber(p.pensionEmployee) + toNumber(p.pensionEmployer),
  }))
}

/**
 * Generate NHF Schedule
 */
export async function generateNHFSchedule(
  payPeriodId: string,
  companyId: string
): Promise<NHFScheduleEntry[]> {
  const payslips = await prisma.computedPayslip.findMany({
    where: {
      payPeriodId,
      companyId,
      paymentStatus: PaymentStatus.ACTIVE,
    },
    orderBy: { employeeName: 'asc' },
  })

  return payslips.map((p, index) => ({
    sn: index + 1,
    employeeName: p.employeeName || '',
    basicSalary: toNumber(p.basicSalary),
    nhfContribution: toNumber(p.nhf),
  }))
}

/**
 * Generate ITF Schedule (1% of total payroll)
 */
export async function generateITFSchedule(
  payPeriodId: string,
  companyId: string
): Promise<ITFNSITFSchedule> {
  const payslips = await prisma.computedPayslip.findMany({
    where: {
      payPeriodId,
      companyId,
      paymentStatus: PaymentStatus.ACTIVE,
    },
  })

  const totalGross = payslips.reduce(
    (sum, p) => sum + toNumber(p.grossSalary),
    0
  )
  const itfRate = 0.01 // 1%
  const totalITF = totalGross * itfRate

  return {
    schedule: [
      { description: 'Total Gross Payroll', amount: totalGross },
      { description: 'ITF Contribution (1%)', amount: totalITF },
    ],
    totalAmount: totalITF,
  }
}

/**
 * Generate NSITF Schedule (1% of payroll)
 */
export async function generateNSITFSchedule(
  payPeriodId: string,
  companyId: string
): Promise<ITFNSITFSchedule> {
  const payslips = await prisma.computedPayslip.findMany({
    where: {
      payPeriodId,
      companyId,
      paymentStatus: PaymentStatus.ACTIVE,
    },
  })

  const totalGross = payslips.reduce(
    (sum, p) => sum + toNumber(p.grossSalary),
    0
  )
  const nsitfRate = 0.01 // 1%
  const totalNSITF = totalGross * nsitfRate

  return {
    schedule: [
      { description: 'Total Gross Payroll', amount: totalGross },
      { description: 'NSITF Contribution (1%)', amount: totalNSITF },
    ],
    totalAmount: totalNSITF,
  }
}

/**
 * Generate Cost Centre Summary (by department)
 */
export async function generateCostCentreSummary(
  payPeriodId: string,
  companyId: string
): Promise<CostCentreEntry[]> {
  const payslips = await prisma.computedPayslip.findMany({
    where: {
      payPeriodId,
      companyId,
      paymentStatus: PaymentStatus.ACTIVE,
    },
  })

  // Group by department
  const departmentMap = new Map<string, CostCentreEntry>()

  for (const p of payslips) {
    const dept = p.departmentName || 'Unassigned'
    const existing = departmentMap.get(dept) || {
      department: dept,
      headCount: 0,
      totalBasic: 0,
      totalAllowances: 0,
      totalOvertime: 0,
      totalGross: 0,
      totalPension: 0,
      totalPAYE: 0,
      totalDeductions: 0,
      totalNet: 0,
    }

    existing.headCount++
    existing.totalBasic += toNumber(p.basicSalary)
    existing.totalAllowances +=
      toNumber(p.housingAllowance) +
      toNumber(p.transportAllowance) +
      toNumber(p.dressingAllowance) +
      toNumber(p.leaveAllowance) +
      toNumber(p.entertainmentAllowance) +
      toNumber(p.utilityAllowance) +
      toNumber(p.otherAllowances)
    existing.totalOvertime += toNumber(p.overtimeEarnings)
    existing.totalGross += toNumber(p.grossSalary)
    existing.totalPension += toNumber(p.pensionEmployee)
    existing.totalPAYE += toNumber(p.monthlyPAYE)
    existing.totalDeductions += toNumber(p.totalDeductions)
    existing.totalNet += toNumber(p.netSalary)

    departmentMap.set(dept, existing)
  }

  return Array.from(departmentMap.values()).sort((a, b) =>
    a.department.localeCompare(b.department)
  )
}

/**
 * Export report data to Excel buffer
 */
export function exportToExcel(data: any[], sheetName: string): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

/**
 * Get report data based on type
 */
export async function getReportData(
  payPeriodId: string,
  companyId: string,
  reportType: string
): Promise<any> {
  switch (reportType) {
    case 'BANK_SCHEDULE':
      return generateBankSchedule(payPeriodId, companyId)
    case 'WITHHELD_SALARIES':
      return generateWithheldSchedule(payPeriodId, companyId)
    case 'PAYE_SCHEDULE':
      return generatePAYESchedule(payPeriodId, companyId)
    case 'PENSION_SCHEDULE':
      return generatePensionSchedule(payPeriodId, companyId)
    case 'NHF_SCHEDULE':
      return generateNHFSchedule(payPeriodId, companyId)
    case 'ITF_SCHEDULE':
      return generateITFSchedule(payPeriodId, companyId)
    case 'NSITF_SCHEDULE':
      return generateNSITFSchedule(payPeriodId, companyId)
    case 'COST_CENTRE_SUMMARY':
      return generateCostCentreSummary(payPeriodId, companyId)
    default:
      throw new Error(`Unknown report type: ${reportType}`)
  }
}
