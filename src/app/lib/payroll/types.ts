// src/app/lib/payroll/types.ts
import type { PayrollTemplateType } from '@/app/lib/payroll/templates/types'

export type ParsedPayrollRow = {
  rowNumber: number
  staffId: string
  email: string
  fullName: string
  
  // pay period
  periodMonth: number
  periodYear: number
  
  // earnings
  basicSalary: number
  housingAllowance: number
  transportAllowance: number
  transportationAllowance: number
  otherAllowances: number
  grossPay: number
  
  // deductions
  payee: number
  pension: number
  
  // totals
  netPay: number
  
  // attendance
  daysInMonth: number
  daysWorked: number
  
  // template-specific fields
  bonusKPI?: number
  deductions?: number
  
  // BLUERIDGE-specific fields
  overtimeIncome?: number
  communicationAllowance?: number
  outstandingIncome?: number
  employerPension?: number
  managementFee?: number
  vatOnManagementFee?: number
  totalInvoiceValue?: number
  
  // raw original row (for debugging / failed records)
  rawRow: any
}

export type GeneratePayslipInput = {
  staff: {
    staffId: string
    firstName: string
    lastName: string
    email: string
    department?: string
    designation?: string
    position?: string
    companyName?: string
    companyAddress?: string
    companyPhone?: string
    companyLogo?: string
    companyTaxId?: string
  }
  payroll: ParsedPayrollRow
  templateType?: PayrollTemplateType
}

// Export TemplateType alias for compatibility
export type TemplateType = PayrollTemplateType