// ============================================================
// PHED Module – Shared TypeScript Types
// ============================================================

export type PhedStaffCategory = 'REGULAR' | 'CONTRACT' | 'NYSC_IT'
export type PhedPayPeriodStatus =
  | 'DRAFT'
  | 'VALIDATION_OPEN'
  | 'VALIDATION_CLOSED'
  | 'TEMPLATE_ISSUED'
  | 'PROCESSING'
  | 'REVIEW'
  | 'APPROVED'
  | 'PAID'
export type PhedValidationStatus = 'PENDING' | 'YES_FOR_PAYMENT' | 'NO_FOR_PAYMENT'
export type PhedPaymentStatus = 'ACTIVE' | 'WITHHELD'
export type PhedAllowanceType =
  | 'HOUSING'
  | 'TRANSPORT'
  | 'FURNITURE'
  | 'MEAL_SUBSIDY'
  | 'UTILITY'
  | 'LEAVE'
  | 'SHIFT'
  | 'OTHER'
export type PhedValueType = 'FIXED' | 'PERCENTAGE'

// -------------------------------------------------------
// Salary breakdown used in payroll computation
// -------------------------------------------------------
export interface PhedSalaryComponents {
  basicSalary:           number
  housingAllowance:      number
  transportAllowance:    number
  furnitureAllowance:    number
  mealSubsidy:           number
  utilityAllowance:      number
  leaveAllowance:        number
  shiftAllowance:        number
  domesticAllowance:     number
  hazardAllowance:       number
  electricityAllowance:  number
  discoveryAllowance:    number
  carSubsidy:            number
  entertainmentAllowance: number
  dataAllowance:         number
  nightAllowance:        number
  arrears:               number
  otherAllowances:       number
}

// -------------------------------------------------------
// Input to the payroll processor for one staff member
// (template-driven flow: salary values come from uploaded XLSX)
// -------------------------------------------------------
export interface PhedPayrollInput {
  staffId: string
  staffDbId: string
  staffName: string
  staffEmail: string
  staffIdCode: string
  category: PhedStaffCategory
  gradeName: string
  department: string
  unit: string
  regionName: string
  salary: PhedSalaryComponents    // HR-entered via payroll template
  hasLifeAssurance: boolean
  lifeAssuranceAmount: number     // Annual life assurance premium (0 if none)
  overtimeHours: number           // Used only for OT amount computation; actual OT amount comes from stored entry
  overtimeAmount: number          // Pre-computed OT amount (stored after OT hours upload)
  unionDeductionTotal: number     // Pre-summed union percentages (applied to gross)
  cooperativeDeductionTotal: number // Pre-summed fixed cooperative totalAmount per member
  deductionLiabilityTotal: number   // Pre-summed fixed deduction/liability amount per member
  voluntaryPension: number        // Monthly voluntary pension deduction (HR-entered)
  insurance: number               // Monthly insurance deduction (HR-entered)
  cashAdvanced: number            // Cash advance for this period (HR-entered)
  loan: number                    // Loan deduction for this period (HR-entered)
  domesticLoan: number            // Domestic loan deduction for this period (HR-entered)
  validationStatus: PhedValidationStatus
  withheldReason?: string
  bankName: string
  accountNumber: string
  accountName: string
  pfaName: string
  rsaPin: string
  pensionNumber?: string
  tin?: string
}

// -------------------------------------------------------
// Output from the payroll processor for one staff member
// -------------------------------------------------------
export interface PhedPayrollResult {
  staffId: string
  staffName: string
  staffEmail: string
  staffIdCode: string
  category: PhedStaffCategory
  gradeName: string
  department: string
  unit: string
  regionName: string

  // Earnings
  basicSalary:            number
  housingAllowance:       number
  transportAllowance:     number
  furnitureAllowance:     number
  mealSubsidy:            number
  utilityAllowance:       number
  leaveAllowance:         number
  shiftAllowance:         number
  domesticAllowance:      number
  hazardAllowance:        number
  electricityAllowance:   number
  discoveryAllowance:     number
  carSubsidy:             number
  entertainmentAllowance: number
  dataAllowance:          number
  nightAllowance:         number
  arrears:                number
  otherAllowances:        number
  overtimeEarnings:       number
  grossSalary:            number

  // Statutory
  pensionEmployee: number
  pensionEmployer: number
  nhf: number

  // Tax (NTA 2025)
  annualRentRelief: number
  lifeAssuranceAmount: number
  annualGrossIncome: number
  annualPensionDeduction: number
  annualChargeableIncome: number
  annualPAYE: number
  monthlyPAYE: number

  // Variable deductions
  unionDeductions:        number
  cooperativeDeductions:  number
  deductionLiabilities:   number
  voluntaryPension:       number
  insurance:              number
  cashAdvanced:           number
  loan:                   number
  domesticLoan:           number
  otherDeductions:        number
  totalDeductions:        number

  netSalary: number
  validationStatus: PhedValidationStatus
  paymentStatus: PhedPaymentStatus
  withheldReason?: string

  // Banking snapshot
  bankName: string
  accountNumber: string
  accountName: string
  pfaName: string
  rsaPin: string
  pensionNumber?: string
  tin?: string
}

// -------------------------------------------------------
// Tax band definition
// -------------------------------------------------------
export interface TaxBand {
  from: number
  to: number   // Infinity for the top band
  rate: number // e.g. 0.15 for 15%
}

// -------------------------------------------------------
// Report row types
// -------------------------------------------------------
export interface BankScheduleRow {
  sn: number
  staffId: string
  staffName: string
  bankName: string
  accountNumber: string
  accountName: string
  netSalary: number
  department: string
  region: string
}

export interface PensionScheduleRow {
  sn: number
  staffId: string
  staffName: string
  pfaName: string
  rsaPin: string
  pensionNumber: string
  pensionEmployee: number
  pensionEmployer: number
  totalPension: number
  grossSalary: number
}

export interface PAYEScheduleRow {
  sn: number
  staffId: string
  staffName: string
  tin: string
  grossSalary: number
  annualGrossIncome: number
  annualChargeableIncome: number
  annualPAYE: number
  monthlyPAYE: number
  department: string
}

export interface StatutoryScheduleRow {
  sn: number
  staffId: string
  staffName: string
  grossSalary: number
  amount: number  // ITF/NSITF/NHF amount
  department: string
}

export interface CostCentreRow {
  region: string
  department: string
  unit: string
  headCount: number
  totalGross: number
  totalNet: number
  totalPAYE: number
  totalPension: number
}

export interface WithheldRow {
  sn: number
  staffId: string
  staffName: string
  grossSalary: number
  netSalary: number
  reason?: string
  department: string
  region: string
}

// -------------------------------------------------------
// Bulk upload types
// -------------------------------------------------------
export interface StaffCsvRow {
  firstName: string
  lastName: string
  staffId: string
  email: string
  phone?: string
  category: string
  gradeCode?: string
  department?: string
  unit?: string
  region?: string
  feeder?: string
  payPoint?: string
  bankName?: string
  accountNumber?: string
  accountName?: string
  rsaPin?: string
  pfaName?: string
  pensionNumber?: string
  tin?: string
  basicSalary?: string
  annualRent?: string
  hasLifeAssurance?: string      // 'YES'/'TRUE'/'1' → true
  lifeAssuranceAmount?: string
}

export interface ValidationCsvRow {
  staffId: string
  status: string  // YES | NO
  reason?: string
}

export interface OvertimeCsvRow {
  staffId: string
  overtimeHours: string
}

export interface MembershipCsvRow {
  staffId: string
}

export interface CooperativeMemberCsvRow {
  staffId:            string
  contributionAmount: number
  loanAmount:         number
  totalAmount:        number
}

export interface DeductionMemberCsvRow {
  staffId: string
  amount:  number
}

// -------------------------------------------------------
// Payroll template types (XLSX download / upload)
// -------------------------------------------------------

// One row in the payroll template XLSX (mirrors column layout)
export interface PayrollTemplateRow {
  staffId:   string   // locked / prefilled
  staffName: string   // locked / prefilled

  // Salary — HR fills these columns
  grossPay:              number
  basicSalary:           number
  housingAllowance:      number
  transportAllowance:    number
  furnitureAllowance:    number
  mealSubsidy:           number
  utilityAllowance:      number
  leaveAllowance:        number
  shiftAllowance:        number
  domesticAllowance:     number
  hazardAllowance:       number
  electricityAllowance:  number
  discoveryAllowance:    number
  carSubsidy:            number
  entertainmentAllowance: number
  dataAllowance:         number
  nightAllowance:        number
  arrears:               number
  otherAllowances:       number

  // Prefilled & locked
  overtimeAmount:        number

  // HR fills these
  voluntaryPension:      number
  insurance:             number
  cashAdvanced:          number
  loan:                  number
  domesticLoan:          number

  // Dynamic deduction columns (prefilled & locked per staff)
  cooperativeAmounts:    Record<string, number>  // cooperativeName → amount
  unionAmounts:          Record<string, number>  // unionName → amount
  deductionAmounts:      Record<string, number>  // deductionName → amount
}

// Parsed/validated template row after upload
export interface ParsedTemplateRow {
  staffId:               string
  basicSalary:           number
  housingAllowance:      number
  transportAllowance:    number
  furnitureAllowance:    number
  mealSubsidy:           number
  utilityAllowance:      number
  leaveAllowance:        number
  shiftAllowance:        number
  domesticAllowance:     number
  hazardAllowance:       number
  electricityAllowance:  number
  discoveryAllowance:    number
  carSubsidy:            number
  entertainmentAllowance: number
  dataAllowance:         number
  nightAllowance:        number
  arrears:               number
  otherAllowances:       number
  voluntaryPension:      number
  insurance:             number
  cashAdvanced:          number
  loan:                  number
  domesticLoan:          number
}

// Per-period union deduction snapshot (stored before template is issued)
export interface PhedUnionSnapshot {
  unionId:   string
  unionName: string
  staffId:   string
  amount:    number
}

