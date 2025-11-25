// src/app/lib/payroll/types.ts

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
    companyName?: string
    companyAddress?: string
    companyPhone?: string
  }
  payroll: ParsedPayrollRow
}
