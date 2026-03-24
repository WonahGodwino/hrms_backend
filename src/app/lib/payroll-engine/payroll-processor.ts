/**
 * Payroll Processor Service
 * Main orchestration service for payroll computation
 */

import { prisma } from '@/app/lib/db'
import { PayPeriodStatus, PaymentStatus, ValidationStatus, Prisma } from '@prisma/client'
import { calculatePAYE, calculateTotalOvertime } from './tax-engine'
import { getActiveSalaryStructures } from './employee-salary'
import { getStaffValidation } from './validation-portal'
import { getOvertimeForComputation } from './overtime'
import { getStaffDeductions } from './deductions'
import * as payPeriodService from './pay-period'
import {
  PayrollComputationSummary,
  PayrollSummary,
  TaxCalculationInput,
} from './types'

// Helper to convert Prisma Decimal to number
const toNumber = (val: Prisma.Decimal | number | null | undefined): number => {
  if (val === null || val === undefined) return 0
  return typeof val === 'number' ? val : Number(val)
}

/**
 * Compute payroll for all employees in a period
 */
export async function computePayroll(
  payPeriodId: string,
  companyId: string,
  options: { nhisApplicable?: boolean } = {}
): Promise<PayrollComputationSummary> {
  // Validate period status
  const period = await prisma.payPeriod.findUnique({
    where: { id: payPeriodId },
  })

  if (!period) {
    throw new Error(`Payroll period ${payPeriodId} not found`)
  }

  if (period.status !== PayPeriodStatus.VALIDATION_CLOSED) {
    throw new Error(
      `Cannot compute payroll. Period must be in VALIDATION_CLOSED status. Current: ${period.status}`
    )
  }

  // Update status to COMPUTING
  await payPeriodService.updateStatus(payPeriodId, PayPeriodStatus.COMPUTING)

  const results: PayrollComputationSummary = {
    processed: 0,
    errors: [],
    summary: {
      totalGross: 0,
      totalNet: 0,
      totalPAYE: 0,
      totalPension: 0,
    },
  }

  try {
    // Get all active salary structures
    const salaryStructures = await getActiveSalaryStructures(companyId)

    for (const salary of salaryStructures) {
      try {
        const payslip = await computeSinglePayslip(
          salary,
          payPeriodId,
          companyId,
          period.standardMonthlyHours,
          options.nhisApplicable || false
        )

        results.processed++
        results.summary.totalGross += toNumber(payslip.grossSalary)
        results.summary.totalNet += toNumber(payslip.netSalary)
        results.summary.totalPAYE += toNumber(payslip.monthlyPAYE)
        results.summary.totalPension += toNumber(payslip.pensionEmployee)
      } catch (error: any) {
        results.errors.push(`Staff ${salary.staffId}: ${error.message}`)
      }
    }

    // Update status to REVIEW
    await payPeriodService.updateStatus(payPeriodId, PayPeriodStatus.REVIEW)
  } catch (error) {
    // Revert status on error
    await payPeriodService.updateStatus(
      payPeriodId,
      PayPeriodStatus.VALIDATION_CLOSED
    )
    throw error
  }

  return results
}

/**
 * Compute payslip for a single employee
 */
async function computeSinglePayslip(
  salary: any,
  payPeriodId: string,
  companyId: string,
  standardMonthlyHours: number,
  nhisApplicable: boolean
) {
  const staffId = salary.staffId

  // Get overtime entries
  const overtimeEntries = await getOvertimeForComputation(payPeriodId, staffId)

  // Calculate overtime earnings
  const overtimeEarnings = calculateTotalOvertime(
    toNumber(salary.basicSalary),
    standardMonthlyHours,
    overtimeEntries
  )

  // Get deductions
  const deductions = await getStaffDeductions(payPeriodId, staffId)

  // Get validation status
  const validation = await getStaffValidation(payPeriodId, staffId)

  // Prepare tax calculation input
  const taxInput: TaxCalculationInput = {
    basicSalary: toNumber(salary.basicSalary),
    housingAllowance: toNumber(salary.housingAllowance),
    transportAllowance: toNumber(salary.transportAllowance),
    dressingAllowance: toNumber(salary.dressingAllowance),
    leaveAllowance: toNumber(salary.leaveAllowance),
    entertainmentAllowance: toNumber(salary.entertainmentAllowance),
    utilityAllowance: toNumber(salary.utilityAllowance),
    otherAllowances: toNumber(salary.otherAllowances),
    overtimeEarnings,
    bonusKpi: 0, // Can be added later
    annualRent: toNumber(salary.annualRent),
    nhisApplicable,
  }

  // Calculate tax
  const taxResult = calculatePAYE(taxInput)

  // Calculate total deductions
  const totalOtherDeductions =
    deductions.unionDues +
    deductions.cooperativeDeduction +
    deductions.loanRepayment +
    deductions.otherDeductions

  const totalDeductions =
    taxResult.totalStatutoryDeductions +
    taxResult.monthlyPAYE +
    totalOtherDeductions

  // Calculate net salary
  const netSalary = taxResult.monthlyGross - totalDeductions

  // Determine payment status based on validation
  let paymentStatus: PaymentStatus = PaymentStatus.PENDING
  let withheldReason = ''

  if (validation) {
    if (validation.status === ValidationStatus.YES_FOR_PAYMENT) {
      paymentStatus = PaymentStatus.ACTIVE
    } else if (validation.status === ValidationStatus.NO_FOR_PAYMENT) {
      paymentStatus = PaymentStatus.WITHHELD
      withheldReason = validation.reason || 'Withheld by supervisor'
    }
  }

  // Get staff details
  const staff = salary.staff
  const employeeName = staff ? `${staff.firstName} ${staff.lastName}` : ''
  const employeeEmail = staff?.email || ''
  const departmentName = staff?.department || ''

  // Create or update payslip
  const payslipData = {
    payPeriodId,
    staffId,
    employeeName,
    employeeEmail,
    departmentName,
    // Earnings
    basicSalary: toNumber(salary.basicSalary),
    housingAllowance: toNumber(salary.housingAllowance),
    transportAllowance: toNumber(salary.transportAllowance),
    dressingAllowance: toNumber(salary.dressingAllowance),
    leaveAllowance: toNumber(salary.leaveAllowance),
    entertainmentAllowance: toNumber(salary.entertainmentAllowance),
    utilityAllowance: toNumber(salary.utilityAllowance),
    otherAllowances: toNumber(salary.otherAllowances),
    overtimeEarnings,
    bonusKpi: 0,
    grossSalary: taxResult.monthlyGross,
    // Statutory deductions
    pensionEmployee: taxResult.pensionEmployee,
    pensionEmployer: taxResult.pensionEmployer,
    nhf: taxResult.nhf,
    nhis: taxResult.nhis,
    totalStatutoryDeductions: taxResult.totalStatutoryDeductions,
    // Tax
    annualGrossIncome: taxResult.annualGross,
    rentRelief: taxResult.rentRelief,
    consolidatedReliefAllowance: taxResult.consolidatedReliefAllowance,
    annualChargeableIncome: taxResult.chargeableIncome,
    annualPAYE: taxResult.annualPAYE,
    monthlyPAYE: taxResult.monthlyPAYE,
    // Other deductions
    unionDues: deductions.unionDues,
    cooperativeDeduction: deductions.cooperativeDeduction,
    loanRepayment: deductions.loanRepayment,
    otherDeductions: deductions.otherDeductions,
    totalDeductions,
    // Net
    netSalary,
    // Status
    paymentStatus,
    validationStatus: validation?.status || ValidationStatus.PENDING,
    withheldReason,
    // Banking details (denormalized)
    bankName: salary.bankName,
    accountNumber: salary.accountNumber,
    accountName: salary.accountName,
    pensionFundAdministrator: salary.pensionFundAdministrator,
    pensionPin: salary.pensionPin,
    // Company
    companyId,
  }

  // Upsert payslip
  return prisma.computedPayslip.upsert({
    where: {
      payPeriodId_staffId: {
        payPeriodId,
        staffId,
      },
    },
    create: payslipData,
    update: payslipData,
  })
}

/**
 * Get payslips for a period
 */
export async function getPayslipsByPeriod(
  payPeriodId: string,
  companyId: string,
  page = 1,
  limit = 10,
  filters: { paymentStatus?: string; departmentId?: string } = {}
) {
  const where: any = { payPeriodId, companyId }

  if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus
  if (filters.departmentId) where.departmentId = filters.departmentId

  const [data, total] = await Promise.all([
    prisma.computedPayslip.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { employeeName: 'asc' },
    }),
    prisma.computedPayslip.count({ where }),
  ])

  return { data, total, page, limit }
}

/**
 * Get a single payslip
 */
export async function getPayslip(payPeriodId: string, staffId: string) {
  const payslip = await prisma.computedPayslip.findUnique({
    where: {
      payPeriodId_staffId: {
        payPeriodId,
        staffId,
      },
    },
  })

  if (!payslip) {
    throw new Error(
      `Payslip not found for staff ${staffId} in period ${payPeriodId}`
    )
  }

  return payslip
}

/**
 * Get payslips for a staff member (their history)
 */
export async function getStaffPayslipHistory(staffId: string, companyId: string) {
  return prisma.computedPayslip.findMany({
    where: { staffId, companyId },
    include: {
      payPeriod: {
        select: {
          periodName: true,
          year: true,
          month: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Get payroll summary for a period
 */
export async function getPayrollSummary(
  payPeriodId: string,
  companyId: string
): Promise<PayrollSummary> {
  const payslips = await prisma.computedPayslip.findMany({
    where: { payPeriodId, companyId },
  })

  const summary: PayrollSummary = {
    totalStaff: payslips.length,
    totalGross: 0,
    totalNet: 0,
    totalPAYE: 0,
    totalPension: 0,
    totalNHF: 0,
    activeCount: 0,
    withheldCount: 0,
  }

  for (const payslip of payslips) {
    summary.totalGross += toNumber(payslip.grossSalary)
    summary.totalNet += toNumber(payslip.netSalary)
    summary.totalPAYE += toNumber(payslip.monthlyPAYE)
    summary.totalPension += toNumber(payslip.pensionEmployee)
    summary.totalNHF += toNumber(payslip.nhf)

    if (payslip.paymentStatus === PaymentStatus.ACTIVE) {
      summary.activeCount++
    } else if (payslip.paymentStatus === PaymentStatus.WITHHELD) {
      summary.withheldCount++
    }
  }

  return summary
}
