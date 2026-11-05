// Single source of truth for free-trial rules. Change numbers here, not in routes.
// Only companies whose trialStatus is not UNRESTRICTED are ever limited.

export const TRIAL_LENGTH_DAYS = 44
export const READ_ONLY_DAYS = 30
export const MAX_EXTENSION_DAYS = 14

// Modules a self-signup trial company gets. The paper says every module is open
// and only the output is limited. PHED is a client-specific payroll engine, not
// part of the product a prospect is trialling, so it stays off.
export const TRIAL_MODULE_KEYS = [
  'CORE_SETUP',
  'RECRUITMENT',
  'MEETINGS',
  'ONBOARDING',
  'TASK_MANAGEMENT',
  'ATTENDANCE',
  'LEAVE',
  'PAYROLL',
  'TRAINING',
  'CERTIFICATIONS',
  'REPORTS',
  'OFFBOARDING',
  'STAFF_LOANS_BENEFITS',
  'OFFER_LETTERS',
] as const

export type TrialStatus =
  | 'UNRESTRICTED'
  | 'TRIAL'
  | 'READ_ONLY'
  | 'ARCHIVED'
  | 'HELD'
  | 'DECLINED'

export type TrialMetric =
  | 'staff'
  | 'payslips'
  | 'offerLetters'
  | 'payrollRuns'

export interface TrialLimits {
  staff: number
  adminUsers: number
  payslips: number
  offerLetters: number
  payrollRuns: number
  departments: number
  businessUnits: number
  designations: number
  gradeLevels: number
  payrollTemplates: number
  openJobs: number
  applicantsPerJob: number
  courses: number
  certificationTypes: number
  sampleLoans: number
  staffEmailsPerDay: number
  storageMb: number
}

const STANDARD: TrialLimits = {
  staff: 10,
  adminUsers: 2,
  payslips: 6,
  offerLetters: 6,
  payrollRuns: 1,
  departments: 3,
  businessUnits: 1,
  designations: 5,
  gradeLevels: 5,
  payrollTemplates: 1,
  openJobs: 1,
  applicantsPerJob: 20,
  courses: 2,
  certificationTypes: 1,
  sampleLoans: 2,
  staffEmailsPerDay: 30,
  storageMb: 200,
}

// Used when a sign-up has no registration number: same shape, smaller numbers.
const TIGHT: TrialLimits = {
  ...STANDARD,
  staff: 5,
  payslips: 3,
  offerLetters: 3,
  staffEmailsPerDay: 10,
}

export const LIMIT_PROFILES: Record<string, TrialLimits> = {
  standard: STANDARD,
  tight: TIGHT,
}

export function limitsForProfile(profile?: string | null): TrialLimits {
  return LIMIT_PROFILES[profile || 'standard'] || STANDARD
}

export const METRIC_LIMIT_KEY: Record<TrialMetric, keyof TrialLimits> = {
  staff: 'staff',
  payslips: 'payslips',
  offerLetters: 'offerLetters',
  payrollRuns: 'payrollRuns',
}

export const METRIC_LABEL: Record<TrialMetric, string> = {
  staff: 'staff records',
  payslips: 'payslips',
  offerLetters: 'offer letters',
  payrollRuns: 'payroll runs',
}

// Structural limits: counted from live records at the moment of creation.
export type TrialCapacity =
  | 'adminUsers'
  | 'departments'
  | 'businessUnits'
  | 'designations'
  | 'payrollTemplates'
  | 'openJobs'
  | 'courses'
  | 'certificationTypes'
  | 'sampleLoans'

export const CAPACITY_LABEL: Record<TrialCapacity, string> = {
  adminUsers: 'admin or HR users',
  departments: 'departments',
  businessUnits: 'business unit',
  designations: 'designations',
  payrollTemplates: 'custom payroll template',
  openJobs: 'open job',
  courses: 'training courses',
  certificationTypes: 'certification type',
  sampleLoans: 'sample loans',
}
