/**
 * Payroll Engine Types and Interfaces
 * Type definitions for the intelligent payroll computing module
 */

// Re-export Prisma enums for convenience
export {
  PayPeriodStatus,
  ValidationStatus,
  PaymentStatus,
  EmployeeCategory,
  DeductionType,
  ReportType,
} from '@prisma/client'

/**
 * Input data required for tax calculation
 */
export interface TaxCalculationInput {
  basicSalary: number
  housingAllowance: number
  transportAllowance: number
  dressingAllowance: number
  leaveAllowance: number
  entertainmentAllowance: number
  utilityAllowance: number
  otherAllowances: number
  overtimeEarnings: number
  bonusKpi: number
  annualRent: number
  nhisApplicable: boolean
}

/**
 * Result of tax calculation
 */
export interface TaxCalculationResult {
  monthlyGross: number
  annualGross: number
  pensionEmployee: number
  pensionEmployer: number
  nhf: number
  nhis: number
  totalStatutoryDeductions: number
  rentRelief: number
  consolidatedReliefAllowance: number
  chargeableIncome: number
  annualPAYE: number
  monthlyPAYE: number
  effectiveTaxRate: number
}

/**
 * Tax band definition for progressive taxation
 */
export interface TaxBand {
  limit: number
  rate: number
}

/**
 * Overtime calculation input
 */
export interface OvertimeCalculationInput {
  basicSalary: number
  monthlyHours: number
  overtimeHours: number
  multiplier: number
}

/**
 * Complete payslip computation input
 */
export interface PayslipComputationInput {
  staffId: string
  payPeriodId: string
  employeeSalary: {
    basicSalary: number
    housingAllowance: number
    transportAllowance: number
    dressingAllowance: number
    leaveAllowance: number
    entertainmentAllowance: number
    utilityAllowance: number
    otherAllowances: number
    annualRent: number
  }
  overtimeEarnings: number
  bonusKpi: number
  deductions: {
    unionDues: number
    cooperativeDeduction: number
    loanRepayment: number
    otherDeductions: number
  }
  nhisApplicable: boolean
}

/**
 * Complete payslip computation result
 */
export interface PayslipComputationResult {
  staffId: string
  payPeriodId: string
  basicSalary: number
  housingAllowance: number
  transportAllowance: number
  dressingAllowance: number
  leaveAllowance: number
  entertainmentAllowance: number
  utilityAllowance: number
  otherAllowances: number
  overtimeEarnings: number
  bonusKpi: number
  grossSalary: number
  pensionEmployee: number
  pensionEmployer: number
  nhf: number
  nhis: number
  totalStatutoryDeductions: number
  annualGrossIncome: number
  rentRelief: number
  consolidatedReliefAllowance: number
  annualChargeableIncome: number
  annualPAYE: number
  monthlyPAYE: number
  unionDues: number
  cooperativeDeduction: number
  loanRepayment: number
  otherDeductions: number
  totalDeductions: number
  netSalary: number
}

/**
 * Tax breakdown item
 */
export interface TaxBreakdownItem {
  band: string
  taxable: number
  rate: number
  tax: number
}

/**
 * DTOs for Pay Period
 */
export interface CreatePayPeriodDto {
  year: number
  month: number
  standardMonthlyHours?: number
}

export interface UpdatePayPeriodDto {
  year?: number
  month?: number
  standardMonthlyHours?: number
}

export interface QueryPayPeriodDto {
  year?: number
  status?: string
  page?: number
  limit?: number
}

/**
 * DTOs for Employee Salary
 */
export interface CreateEmployeeSalaryDto {
  staffId: string
  employeeCategory?: string
  basicSalary: number
  housingAllowance?: number
  transportAllowance?: number
  dressingAllowance?: number
  leaveAllowance?: number
  entertainmentAllowance?: number
  utilityAllowance?: number
  otherAllowances?: number
  annualRent?: number
  bankName?: string
  accountNumber?: string
  accountName?: string
  pensionFundAdministrator?: string
  pensionPin?: string
  effectiveDate?: string
}

export interface UpdateEmployeeSalaryDto {
  employeeCategory?: string
  basicSalary?: number
  housingAllowance?: number
  transportAllowance?: number
  dressingAllowance?: number
  leaveAllowance?: number
  entertainmentAllowance?: number
  utilityAllowance?: number
  otherAllowances?: number
  annualRent?: number
  bankName?: string
  accountNumber?: string
  accountName?: string
  pensionFundAdministrator?: string
  pensionPin?: string
  effectiveDate?: string
}

export interface QueryEmployeeSalaryDto {
  page?: number
  limit?: number
  isActive?: boolean
  employeeCategory?: string
}

/**
 * DTOs for Pay Validation
 */
export interface ValidateStaffDto {
  payPeriodId: string
  staffId: string
  status: 'YES_FOR_PAYMENT' | 'NO_FOR_PAYMENT'
  reason?: string
}

export interface BulkValidationItem {
  staffId: string
  status: 'YES_FOR_PAYMENT' | 'NO_FOR_PAYMENT' | 'yes_for_payment' | 'no_for_payment'
  reason?: string
}

export interface BulkValidateDto {
  payPeriodId: string
  validations: BulkValidationItem[]
}

export interface ValidationSummaryResponse {
  total: number
  pending: number
  yesForPayment: number
  noForPayment: number
  percentageCompleted: number
}

/**
 * DTOs for Overtime
 */
export interface CreateOvertimeEntryDto {
  payPeriodId: string
  staffId: string
  overtimeHours: number
  multiplier?: number
  date?: string
  description?: string
}

export interface QueryOvertimeEntryDto {
  page?: number
  limit?: number
  staffId?: string
}

/**
 * DTOs for Deductions
 */
export interface CreateDeductionEntryDto {
  payPeriodId: string
  staffId: string
  deductionType: string
  amount: number
  description?: string
}

export interface QueryDeductionEntryDto {
  page?: number
  limit?: number
  staffId?: string
  deductionType?: string
}

/**
 * DTOs for Computed Payslip
 */
export interface ComputePayrollDto {
  nhisApplicable?: boolean
}

export interface QueryComputedPayslipDto {
  page?: number
  limit?: number
  paymentStatus?: string
  departmentId?: string
}

/**
 * Payroll computation result summary
 */
export interface PayrollComputationSummary {
  processed: number
  errors: string[]
  summary: {
    totalGross: number
    totalNet: number
    totalPAYE: number
    totalPension: number
  }
}

/**
 * Payroll period summary
 */
export interface PayrollSummary {
  totalStaff: number
  totalGross: number
  totalNet: number
  totalPAYE: number
  totalPension: number
  totalNHF: number
  activeCount: number
  withheldCount: number
}

/**
 * Staff deductions summary
 */
export interface StaffDeductionsSummary {
  unionDues: number
  cooperativeDeduction: number
  loanRepayment: number
  otherDeductions: number
  total: number
}

/**
 * Deduction summary by type
 */
export interface DeductionSummaryByType {
  type: string
  count: number
  totalAmount: number
}

/**
 * Report data types
 */
export interface BankScheduleEntry {
  sn: number
  employeeName: string
  bankName: string | null
  accountNumber: string | null
  accountName: string | null
  netSalary: number
}

export interface WithheldScheduleEntry {
  sn: number
  employeeName: string
  department: string | null
  grossSalary: number
  netSalary: number
  reason: string | null
}

export interface PAYEScheduleEntry {
  sn: number
  employeeName: string
  annualGrossIncome: number
  consolidatedRelief: number
  rentRelief: number
  chargeableIncome: number
  annualPAYE: number
  monthlyPAYE: number
}

export interface PensionScheduleEntry {
  sn: number
  employeeName: string
  rsaPin: string | null
  pfaName: string | null
  employeeContribution: number
  employerContribution: number
  totalContribution: number
}

export interface NHFScheduleEntry {
  sn: number
  employeeName: string
  basicSalary: number
  nhfContribution: number
}

export interface ITFNSITFSchedule {
  schedule: Array<{ description: string; amount: number }>
  totalAmount: number
}

export interface CostCentreEntry {
  department: string
  headCount: number
  totalBasic: number
  totalAllowances: number
  totalOvertime: number
  totalGross: number
  totalPension: number
  totalPAYE: number
  totalDeductions: number
  totalNet: number
}

/**
 * DTOs for Staff Management
 */
export interface CreateStaffDto {
  staffId: string
  email: string
  firstName: string
  lastName: string
  department: string
  position: string
  phone?: string
  bankName?: string
  accountNumber?: string
  bvn?: string
}

export interface UpdateStaffDto {
  email?: string
  firstName?: string
  lastName?: string
  department?: string
  position?: string
  phone?: string
  bankName?: string
  accountNumber?: string
  bvn?: string
}

export interface QueryStaffDto {
  page?: number
  limit?: number
  search?: string
  department?: string
  includeInactive?: boolean
}

export interface StaffWithSalaryStatus {
  id: string
  staffId: string
  email: string
  firstName: string
  lastName: string
  fullName: string
  department: string
  position: string
  phone: string | null
  isActive: boolean
  hasSalaryStructure: boolean
  createdAt: Date
}
