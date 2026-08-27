// Central registry of every module in the platform.
// Adding a new module: add one entry here, then run
// POST /api/super-admin/modules/sync to create the access rows.

export const PLATFORM_MODULES = [
  {
    key:         'CORE_SETUP',
    name:        'Core Setup',
    description: 'Company structure — departments, business units, designations, grade levels and staff records',
  },
  {
    key:         'RECRUITMENT',
    name:        'Recruitment',
    description: 'Job postings, applicant tracking, interviews and selection',
  },
  {
    key:         'MEETINGS',
    name:        'Meetings',
    description: 'In-app video meetings, scheduling, lobby controls and recordings',
  },
  {
    key:         'ONBOARDING',
    name:        'Onboarding',
    description: 'New hire onboarding workflows, checklists and command centre',
  },
  {
    key:         'TASK_MANAGEMENT',
    name:        'Task Management',
    description: 'Task dashboard, assignment and tracking for HR and staff',
  },
  {
    key:         'ATTENDANCE',
    name:        'Attendance',
    description: 'Attendance tracking, daily, weekly and monthly reports',
  },
  {
    key:         'LEAVE',
    name:        'Leave Management',
    description: 'Leave applications, approvals, balances and policy management',
  },
  {
    key:         'PAYROLL',
    name:        'General Payroll',
    description: 'Standard payroll processing, payslips and salary schedules',
  },
  {
    key:         'TRAINING',
    name:        'Training & Certifications',
    description: 'Training programs, sessions, assessments and certification tracking',
  },
  {
    key:         'OFFBOARDING',
    name:        'Offboarding',
    description: 'Employee exit workflows, task management and offboarding records',
  },
  {
    key:         'PHED',
    name:        'PHED Payroll',
    description: 'Port Harcourt Electricity Distribution payroll engine — staff management, pay periods, computation, and reports',
  },
  {
    key:         'STAFF_LOANS_BENEFITS',
    name:        'Staff Loans & Benefits',
    description: 'Loan applications, benefit requests, policy configuration, eligibility validation and staff financial dashboards',
  },
  {
    key:         'OFFER_LETTERS',
    name:        'Offer Letters',
    description: 'Upload a Word letter template and generate near-identical offer/promotion/renewal letters for staff, independent of the recruitment pipeline',
  },
  {
    key:         'PAYROLL_NAME_VERIFIER',
    name:        'Payroll Name Verifier',
    description: 'Verify payroll spreadsheet names against real bank account names via Flutterwave before a payroll run, flagging mismatches for review',
  },
] as const

export type ModuleKey = typeof PLATFORM_MODULES[number]['key']
