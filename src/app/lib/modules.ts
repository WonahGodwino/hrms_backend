// Central registry of every module in the platform.
// Adding a new module: add one entry here, then run
// POST /api/super-admin/modules/sync to create the access rows.
//
// `icon` is the default lucide icon key used in the sidebar; super admins can
// override label/icon/section/order per module via Module Setup (stored on
// the PlatformModule row — navLabel / navIcon / navSectionId / navOrder).
// `defaultSection` is the sidebar section label the module lands in when the
// nav_sections table hasn't assigned it one.
export const PLATFORM_MODULES = [
  {
    key:         'CORE_SETUP',
    name:        'Core Setup',
    description: 'Company structure — departments, business units, designations, grade levels and staff records',
    icon:        'Building2',
    defaultSection: null,
    defaultOrder: 1,
  },
  {
    key:         'RECRUITMENT',
    name:        'Recruitment',
    description: 'Job postings, applicant tracking, interviews and selection',
    icon:        'Kanban',
    defaultSection: 'Workforce',
    defaultOrder: 3,
  },
  {
    key:         'MEETINGS',
    name:        'Meetings',
    description: 'In-app video meetings, scheduling, lobby controls and recordings',
    icon:        'Video',
    defaultSection: 'More',
    defaultOrder: 2,
  },
  {
    key:         'ONBOARDING',
    name:        'Onboarding',
    description: 'New hire onboarding workflows, checklists and command centre',
    icon:        'UserCheck',
    defaultSection: 'More',
    defaultOrder: 3,
  },
  {
    key:         'TASK_MANAGEMENT',
    name:        'Task Management',
    description: 'Task dashboard, assignment and tracking for HR and staff',
    icon:        'ClipboardList',
    defaultSection: 'More',
    defaultOrder: 4,
  },
  {
    key:         'ATTENDANCE',
    name:        'Attendance',
    description: 'Attendance tracking, daily, weekly and monthly reports',
    icon:        'CalendarDays',
    defaultSection: 'Workforce',
    defaultOrder: 1,
  },
  {
    key:         'LEAVE',
    name:        'Leave Management',
    description: 'Leave applications, approvals, balances and policy management',
    icon:        'CalendarCheck',
    defaultSection: 'Workforce',
    defaultOrder: 2,
  },
  {
    key:         'PERFORMANCE_APPRAISAL',
    name:        'Performance and Appraisal',
    description: 'Appraisal cycles, review templates, competency frameworks, goals, 360 reviews, PIPs, and performance operations',
    icon:        'BookOpen',
    defaultSection: 'Workforce',
    defaultOrder: 4,
  },
  {
    key:         'PAYROLL',
    name:        'General Payroll',
    description: 'Standard payroll processing, payslips and salary schedules',
    icon:        'Calculator',
    defaultSection: null,
    defaultOrder: 3,
  },
  {
    key:         'TRAINING',
    name:        'Training',
    description: 'Training programs, sessions, assessments, calendars and analytics',
    icon:        'GraduationCap',
    defaultSection: 'Operations',
    defaultOrder: 1,
  },
  {
    key:         'CERTIFICATIONS',
    name:        'Certifications',
    description: 'Staff certification records, documents, compliance tracking and templates',
    icon:        'ShieldCheck',
    defaultSection: 'Operations',
    defaultOrder: 4,
  },
  {
    key:         'REPORTS',
    name:        'Reports',
    description: 'Reporting hub — finance summaries, staff insights and cross-module reports',
    icon:        'BarChart2',
    defaultSection: null,
    defaultOrder: 4,
  },
  {
    key:         'OFFBOARDING',
    name:        'Offboarding',
    description: 'Employee exit workflows, task management and offboarding records',
    icon:        'DoorOpen',
    defaultSection: 'Operations',
    defaultOrder: 3,
  },
  {
    key:         'PHED',
    name:        'PHED Payroll',
    description: 'Port Harcourt Electricity Distribution payroll engine — staff management, pay periods, computation, and reports',
    icon:        'Calculator',
    defaultSection: 'More',
    defaultOrder: 6,
  },
  {
    key:         'STAFF_LOANS_BENEFITS',
    name:        'Staff Loans & Benefits',
    description: 'Loan applications, benefit requests, policy configuration, eligibility validation and staff financial dashboards',
    icon:        'Landmark',
    defaultSection: 'Operations',
    defaultOrder: 2,
  },
  {
    key:         'OFFER_LETTERS',
    name:        'Offer Letters',
    description: 'Upload a Word letter template and generate near-identical offer/promotion/renewal letters for staff, independent of the recruitment pipeline',
    icon:        'FileText',
    defaultSection: 'More',
    defaultOrder: 1,
  },
] as const

export type ModuleKey = typeof PLATFORM_MODULES[number]['key']

// Default sidebar sections, seeded into nav_sections on first sync.
// The main (unlabelled) section is implicit — modules with defaultSection
// null belong to it.
export const DEFAULT_NAV_SECTIONS = [
  { label: 'Workforce', sortOrder: 10, isSystem: true },
  { label: 'Operations', sortOrder: 20, isSystem: true },
  { label: 'More', sortOrder: 30, isSystem: true },
] as const
