// src/app/lib/payroll-engine/tax-filing/types.ts
// TypeScript interfaces for the Tax Filing Module

import { FilingStatus } from '@prisma/client'

// ==================== NIGERIA STATES ====================

// All 36 Nigerian States + FCT
export const NIGERIA_STATES_LIST = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
  'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi',
  'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun',
  'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'
] as const

export type NigeriaState = typeof NIGERIA_STATES_LIST[number]

// ==================== STATE IRS CONFIGURATION ====================

export interface StateTemplateColumn {
  header: string
  key: string
  width: number
  type: 'string' | 'number' | 'currency' | 'date'
}

export interface StateIRSConfig {
  code: string           // 'LA', 'OG', 'FC'
  name: NigeriaState     // 'Lagos', 'Ogun', 'FCT'
  irsName: string        // 'LIRS', 'OGIRS', 'FCT-IRS'
  columns: StateTemplateColumn[]
}

// ==================== EMPLOYEE TAX PROFILE ====================

export interface EmployeeTaxProfileInput {
  staffId: string
  stateOfResidence: NigeriaState
  jtbTin?: string
  pfaName?: string
}

export interface EmployeeTaxProfileUpdate {
  stateOfResidence?: NigeriaState
  jtbTin?: string
  pfaName?: string
  tinVerified?: boolean
}

export interface EmployeeTaxProfileResponse {
  id: string
  staffId: string
  companyId: string
  stateOfResidence: string
  jtbTin: string | null
  tinVerified: boolean
  lockedState: string | null
  lockedDate: Date | null
  pfaName: string | null
  createdAt: Date
  updatedAt: Date
  staff?: {
    id: string
    staffId: string
    firstName: string
    lastName: string
    email: string
    department: string
    position: string
  }
}

// ==================== MONTHLY SCHEDULE ====================

export interface EmployeeScheduleRow {
  sn: number
  taxpayerName: string      // Surname first: "DOE, John"
  jtbTin: string
  staffId: string
  grossIncome: number
  consolidatedRelief: number
  rentRelief: number
  pensionContribution: number
  taxPayable: number
  monthYear: string         // e.g., "January 2026"
}

export interface MonthlyScheduleData {
  stateCode: string
  stateName: string
  irsName: string
  period: {
    year: number
    month: number
    periodName: string
  }
  company: {
    id: string
    name: string
    taxId: string | null
    address: string | null
  }
  employees: EmployeeScheduleRow[]
  totals: {
    grossIncome: number
    taxAmount: number
    employeeCount: number
  }
}

export interface TaxFilingScheduleResponse {
  id: string
  companyId: string
  payPeriodId: string
  stateIrs: string
  stateCode: string
  stateName: string
  totalEmployees: number
  totalTaxAmount: number
  totalGrossIncome: number
  status: FilingStatus
  filedAt: Date | null
  filedBy: string | null
  paymentReference: string | null
  filePath: string | null
  createdAt: Date
  updatedAt: Date
}

export interface GenerateSchedulesRequest {
  periodId: string
}

export interface GenerateSchedulesResponse {
  success: boolean
  schedules: TaxFilingScheduleResponse[]
  summary: {
    totalStates: number
    totalEmployees: number
    totalTaxAmount: number
  }
}

// ==================== ANNUAL RETURN (FORM H1) ====================

export interface AnnualEmployeeRecord {
  sn: number
  taxpayerName: string      // Surname first: "DOE, John"
  jtbTin: string
  staffId: string
  annualGrossIncome: number
  annualTaxDeducted: number
  monthlyBreakdown: {
    month: number
    grossIncome: number
    taxPaid: number
  }[]
}

export interface FormH1Data {
  companyInfo: {
    id: string
    name: string
    taxId: string | null
    address: string | null
  }
  year: number
  stateCode: string
  stateName: string
  irsName: string
  employees: AnnualEmployeeRecord[]
  totals: {
    grossIncome: number
    totalTaxDeducted: number
    employeeCount: number
  }
}

export interface AnnualReturnResponse {
  id: string
  companyId: string
  year: number
  stateIrs: string
  stateCode: string
  stateName: string
  totalEmployees: number
  totalGrossIncome: number
  totalTaxPaid: number
  status: FilingStatus
  filedAt: Date | null
  filedBy: string | null
  formH1FilePath: string | null
  createdAt: Date
  updatedAt: Date
}

export interface GenerateAnnualReturnsRequest {
  year: number
}

export interface GenerateAnnualReturnsResponse {
  success: boolean
  returns: AnnualReturnResponse[]
  summary: {
    totalStates: number
    totalEmployees: number
    totalTaxPaid: number
  }
}

// ==================== TAX CERTIFICATE ====================

export interface TaxCertificateData {
  employee: {
    id: string
    staffId: string
    name: string
    email: string
    jtbTin: string | null
    stateOfResidence: string
  }
  company: {
    name: string
    taxId: string | null
    address: string | null
  }
  year: number
  earnings: {
    totalGrossIncome: number
    totalBasicSalary: number
    totalAllowances: number
  }
  deductions: {
    totalPension: number
    totalNHF: number
    totalNHIS: number
    totalPAYE: number
  }
  monthlyBreakdown: {
    month: number
    monthName: string
    grossIncome: number
    pension: number
    paye: number
    netSalary: number
  }[]
}

// ==================== DASHBOARD ====================

export interface StateFilingStatus {
  stateCode: string
  stateName: string
  irsName: string
  employeeCount: number
  totalTaxAmount: number
  status: FilingStatus
}

export interface MonthlyFilingSummary {
  periodId: string
  periodName: string
  year: number
  month: number
  totalEmployees: number
  totalTaxAmount: number
  statesWithEmployees: number
  statesFiled: number
  statesPending: number
  stateBreakdown: StateFilingStatus[]
}

export interface AnnualFilingSummary {
  year: number
  totalEmployees: number
  totalTaxPaid: number
  statesWithEmployees: number
  statesFiled: number
  statesPending: number
  stateBreakdown: StateFilingStatus[]
}

export interface FilingDashboard {
  currentPeriod: MonthlyFilingSummary | null
  currentYear: AnnualFilingSummary | null
  employeesWithoutTaxProfile: number
  employeesWithTaxProfile: number
  statesWithEmployees: string[]
}

// ==================== BULK IMPORT ====================

export interface TaxProfileImportRow {
  staffId: string
  stateOfResidence: string
  jtbTin?: string
  pfaName?: string
}

export interface TaxProfileImportResult {
  uploadId: string
  totalRecords: number
  successful: number
  failed: number
  errors: string[]
  failedRecordsPath: string | null
}

// ==================== STATE LOCKING ====================

export interface LockStatesRequest {
  year: number
}

export interface LockStatesResponse {
  locked: number
  skipped: number
  alreadyLocked: number
  errors: string[]
}

// ==================== EXPORT FORMAT ====================

export type ExportFormat = 'xlsx' | 'csv'

export interface DownloadScheduleParams {
  periodId: string
  stateCode: string
  format?: ExportFormat
}

export interface DownloadFormH1Params {
  year: number
  stateCode: string
  format?: ExportFormat
}
