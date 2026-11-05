// src/app/lib/companies/export-company-data.ts
//
// Generates a curated, multi-sheet .xlsx export of one company's data —
// the background half of the "Export Company Data" feature (see
// CompanyExportJob in schema.prisma and the sibling API routes under
// src/app/api/companies/[id]/export/**). Kicked off fire-and-forget from
// the POST route, same async pattern as staff bulk-edit/payroll uploads:
// this function owns moving the job from PROCESSING to COMPLETED/FAILED.
//
// Deliberately NOT a literal 1:1 dump of every relation on Company (~108 of
// them). Curated to 10 selectable domains + an always-included Summary
// sheet — excludes binary blob columns (payslip PDFs, uploaded ID/offer
// documents — don't belong in a spreadsheet cell), credentials/secrets
// (password hashes, OTPs, encrypted mailbox passwords, loan e-signatures),
// and the PHED module (a bespoke, isolated client sub-schema, not part of
// the generic company shape).
import ExcelJS from 'exceljs'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { prisma } from '@/app/lib/db'
import { XL, argb, buildSubtitle, confidentialFooter, safeFileName, solid, writeStyledTable } from '@/app/lib/excel/sheet-theme'

export const EXPORT_DOMAINS = [
  'locations',
  'orgStructure',
  'staff',
  'payroll',
  'leave',
  'attendance',
  'recruitment',
  'onboardingOffboarding',
  'training',
  'loansBenefits'
] as const

export type ExportDomain = (typeof EXPORT_DOMAINS)[number]

export const DOMAIN_LABELS: Record<ExportDomain, string> = {
  locations: 'Locations',
  orgStructure: 'Org Structure',
  staff: 'Staff Records',
  payroll: 'Payroll Summary',
  leave: 'Leave Management',
  attendance: 'Attendance',
  recruitment: 'Recruitment',
  onboardingOffboarding: 'Onboarding & Offboarding',
  training: 'Training & Certifications',
  loansBenefits: 'Loans & Benefits'
}

export function isExportDomain(value: unknown): value is ExportDomain {
  return typeof value === 'string' && (EXPORT_DOMAINS as readonly string[]).includes(value)
}

// Masks everything but the last 4 characters — same visual convention the
// admin staff routes already use for account numbers/BVN in API responses
// (e.g. admin/staff/edit/[id]/route.ts: '***' + value.slice(-4)).
function mask(value: string | null | undefined): string {
  if (!value) return ''
  const str = String(value)
  return str.length <= 4 ? '*'.repeat(str.length) : '*'.repeat(str.length - 4) + str.slice(-4)
}

function staffName(s: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  if (!s) return ''
  return `${s.firstName || ''} ${s.lastName || ''}`.trim()
}

function fmtDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : ''
}

function fmtDateTime(d: Date | null | undefined): string {
  return d ? d.toISOString() : ''
}

function fmtDecimal(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

type ColumnDef = { header: string; key: string; width?: number }

// Per-workbook context so the shared title band can name the company without a module-level
// variable (export jobs run fire-and-forget and can overlap).
const workbookContext = new WeakMap<ExcelJS.Workbook, { companyName: string }>()

function isNumericColumn(rows: Record<string, unknown>[], key: string): boolean {
  const values = rows.map((r) => r[key]).filter((v) => v !== null && v !== undefined && v !== '')
  return values.length > 0 && values.every((v) => typeof v === 'number')
}

function addSheet(workbook: ExcelJS.Workbook, title: string, columns: ColumnDef[], rows: Record<string, unknown>[]): number {
  const worksheet = workbook.addWorksheet(title.slice(0, 31)) // Excel sheet-name length limit
  const companyName = workbookContext.get(workbook)?.companyName || ''
  writeStyledTable(worksheet, {
    title,
    subtitle: buildSubtitle([companyName, `${rows.length} row${rows.length === 1 ? '' : 's'}`]),
    columns: columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width || 20,
      align: isNumericColumn(rows, c.key) ? ('right' as const) : ('left' as const)
    })),
    rows,
    emptyMessage: 'No records for this section',
    footer: confidentialFooter(companyName)
  })
  return rows.length
}

type BuildOpts = {
  includeSensitiveData: boolean
  attendanceFrom: Date | null
  attendanceTo: Date | null
}

async function buildLocations(workbook: ExcelJS.Workbook, companyId: string): Promise<number> {
  const rows = await prisma.location.findMany({ where: { companyId }, orderBy: { name: 'asc' } })
  return addSheet(
    workbook,
    DOMAIN_LABELS.locations,
    [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Code', key: 'code', width: 14 },
      { header: 'Type', key: 'type', width: 16 },
      { header: 'Country', key: 'country', width: 16 },
      { header: 'State', key: 'state', width: 16 },
      { header: 'LGA/County', key: 'lga', width: 18 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'Created At', key: 'createdAt', width: 14 }
    ],
    rows.map((r) => ({ name: r.name, code: r.code || '', type: r.type || '', country: r.country || '', state: r.state || '', lga: r.lga || '', address: r.address || '', createdAt: fmtDate(r.createdAt) }))
  )
}

async function buildOrgStructure(workbook: ExcelJS.Workbook, companyId: string): Promise<number> {
  const [departments, businessUnits, designations] = await Promise.all([
    prisma.department.findMany({ where: { companyId }, include: { head: { select: { firstName: true, lastName: true } } }, orderBy: { name: 'asc' } }),
    prisma.businessUnit.findMany({ where: { companyId }, orderBy: { name: 'asc' } }),
    prisma.designation.findMany({ where: { companyId }, orderBy: { title: 'asc' } })
  ])

  const deptCount = addSheet(
    workbook,
    'Departments',
    [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Code', key: 'code', width: 14 },
      { header: 'Business Unit', key: 'businessUnit', width: 20 },
      { header: 'Head', key: 'head', width: 22 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Active Headcount', key: 'activeHeadcount', width: 16 },
      { header: 'Created At', key: 'createdAt', width: 14 }
    ],
    departments.map((d) => ({
      name: d.name,
      code: d.code,
      businessUnit: d.businessUnit || '',
      head: staffName(d.head),
      status: d.status,
      activeHeadcount: d.activeHeadcount || 0,
      createdAt: fmtDate(d.createdAt)
    }))
  )

  addSheet(
    workbook,
    'Business Units',
    [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Code', key: 'code', width: 14 },
      { header: 'Cost Center', key: 'costCenter', width: 16 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Created At', key: 'createdAt', width: 14 }
    ],
    businessUnits.map((b) => ({ name: b.name, code: b.code || '', costCenter: b.costCenter || '', status: b.status, createdAt: fmtDate(b.createdAt) }))
  )

  addSheet(
    workbook,
    'Designations',
    [
      { header: 'Title', key: 'title', width: 24 },
      { header: 'Code', key: 'code', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Staff Count', key: 'staffCount', width: 14 },
      { header: 'Base Pay', key: 'basePay', width: 16 },
      { header: 'Created At', key: 'createdAt', width: 14 }
    ],
    designations.map((d) => ({ title: d.title, code: d.code, status: d.status, staffCount: d.staffCount, basePay: d.basePay, createdAt: fmtDate(d.createdAt) }))
  )

  return deptCount + businessUnits.length + designations.length
}

async function buildStaff(workbook: ExcelJS.Workbook, companyId: string, opts: BuildOpts): Promise<number> {
  const rows = await prisma.staffRecord.findMany({
    where: { companyId },
    include: {
      departments: { select: { name: true } },
      designation: { select: { title: true } },
      locationRecord: { select: { name: true } }
    },
    orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }]
  })

  return addSheet(
    workbook,
    DOMAIN_LABELS.staff,
    [
      { header: 'Staff ID', key: 'staffId', width: 18 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Designation', key: 'designation', width: 20 },
      { header: 'Position', key: 'position', width: 20 },
      { header: 'Location', key: 'location', width: 18 },
      { header: 'Role', key: 'role', width: 12 },
      { header: 'Active', key: 'active', width: 10 },
      { header: 'Hire Date', key: 'hireDate', width: 14 },
      { header: 'Bank Name', key: 'bankName', width: 18 },
      { header: 'Account Number', key: 'accountNumber', width: 18 },
      { header: 'BVN', key: 'bvn', width: 16 },
      { header: 'Created At', key: 'createdAt', width: 14 }
    ],
    rows.map((s) => ({
      staffId: s.staffId,
      name: staffName(s),
      email: s.email,
      phone: s.phone || '',
      department: s.departments?.name || s.department || '',
      designation: s.designation?.title || '',
      position: s.position,
      location: s.locationRecord?.name || s.location || '',
      role: s.role,
      active: s.isActive ? 'Yes' : 'No',
      hireDate: fmtDate(s.hireDate),
      bankName: s.bankName || '',
      accountNumber: opts.includeSensitiveData ? s.accountNumber || '' : mask(s.accountNumber),
      bvn: opts.includeSensitiveData ? s.bvn || '' : mask(s.bvn),
      createdAt: fmtDate(s.createdAt)
    }))
  )
}

async function buildPayroll(workbook: ExcelJS.Workbook, companyId: string): Promise<number> {
  const rows = await prisma.payroll.findMany({
    where: { companyId },
    include: { staffRecord: { select: { staffId: true, firstName: true, lastName: true } } },
    orderBy: [{ year: 'desc' }, { month: 'desc' }]
  })

  return addSheet(
    workbook,
    DOMAIN_LABELS.payroll,
    [
      { header: 'Staff ID', key: 'staffId', width: 16 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Month', key: 'month', width: 12 },
      { header: 'Year', key: 'year', width: 10 },
      { header: 'Gross Pay', key: 'grossPay', width: 14 },
      { header: 'Basic Salary', key: 'basicSalary', width: 14 },
      { header: 'Housing', key: 'housing', width: 12 },
      { header: 'Transport', key: 'transport', width: 12 },
      { header: 'Other Allowance', key: 'otherAllowance', width: 16 },
      { header: 'Deductions', key: 'deductions', width: 14 },
      { header: 'PAYE', key: 'payee', width: 12 },
      { header: 'Pension', key: 'pensionDeduction', width: 12 },
      { header: 'Net Salary', key: 'netSalary', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Source', key: 'source', width: 12 }
    ],
    rows.map((p) => ({
      staffId: p.staffRecord?.staffId || '',
      name: staffName(p.staffRecord),
      month: p.month,
      year: p.year,
      grossPay: fmtDecimal(p.grossPay),
      basicSalary: fmtDecimal(p.basicSalary),
      housing: fmtDecimal(p.housing),
      transport: fmtDecimal(p.transport),
      otherAllowance: fmtDecimal(p.otherAllowance),
      deductions: fmtDecimal(p.deductions),
      payee: fmtDecimal(p.payee),
      pensionDeduction: fmtDecimal(p.pensionDeduction),
      netSalary: fmtDecimal(p.netSalary),
      status: p.status,
      source: p.source
    }))
  )
}

async function buildLeave(workbook: ExcelJS.Workbook, companyId: string): Promise<number> {
  const [requests, policies, holidays] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { companyId },
      include: { staffRecord: { select: { staffId: true, firstName: true, lastName: true } }, leaveType: { select: { name: true } } },
      orderBy: { startDate: 'desc' }
    }),
    prisma.leavePolicy.findMany({ where: { companyId }, orderBy: { name: 'asc' } }),
    prisma.publicHoliday.findMany({ where: { companyId }, orderBy: { date: 'asc' } })
  ])

  const reqCount = addSheet(
    workbook,
    'Leave Requests',
    [
      { header: 'Reference', key: 'reference', width: 16 },
      { header: 'Staff ID', key: 'staffId', width: 16 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Leave Type', key: 'leaveType', width: 16 },
      { header: 'Start Date', key: 'startDate', width: 14 },
      { header: 'End Date', key: 'endDate', width: 14 },
      { header: 'Total Days', key: 'totalDays', width: 12 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Reason', key: 'reason', width: 30 }
    ],
    requests.map((r) => ({
      reference: r.referenceNumber || '',
      staffId: r.staffRecord?.staffId || '',
      name: staffName(r.staffRecord),
      leaveType: r.leaveType?.name || '',
      startDate: fmtDate(r.startDate),
      endDate: fmtDate(r.endDate),
      totalDays: fmtDecimal(r.totalDays),
      status: r.status,
      reason: r.reason
    }))
  )

  addSheet(
    workbook,
    'Leave Policies',
    [
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Max Days', key: 'maxDays', width: 12 },
      { header: 'Carry Over', key: 'carryOver', width: 12 },
      { header: 'Paid', key: 'isPaid', width: 10 },
      { header: 'Approval Workflow', key: 'approvalWorkflow', width: 20 }
    ],
    policies.map((p) => ({ name: p.name, maxDays: p.maxDays, carryOver: p.carryOver, isPaid: p.isPaid ? 'Yes' : 'No', approvalWorkflow: p.approvalWorkflow }))
  )

  addSheet(
    workbook,
    'Public Holidays',
    [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Recurring', key: 'isRecurring', width: 12 }
    ],
    holidays.map((h) => ({ name: h.name, date: fmtDate(h.date), isRecurring: h.isRecurring ? 'Yes' : 'No' }))
  )

  return reqCount + policies.length + holidays.length
}

async function buildAttendance(workbook: ExcelJS.Workbook, companyId: string, opts: BuildOpts): Promise<number> {
  if (!opts.attendanceFrom || !opts.attendanceTo) {
    addSheet(workbook, DOMAIN_LABELS.attendance, [{ header: 'Note', key: 'note', width: 60 }], [{ note: 'No date range was provided — this sheet was skipped.' }])
    return 0
  }

  const rows = await prisma.attendance.findMany({
    where: { companyId, date: { gte: opts.attendanceFrom, lte: opts.attendanceTo } },
    include: { staffRecord: { select: { staffId: true, firstName: true, lastName: true } } },
    orderBy: { date: 'desc' }
  })

  return addSheet(
    workbook,
    DOMAIN_LABELS.attendance,
    [
      { header: 'Staff ID', key: 'staffId', width: 16 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Sign In', key: 'signIn', width: 20 },
      { header: 'Sign Out', key: 'signOut', width: 20 },
      { header: 'Status', key: 'status', width: 14 }
    ],
    rows.map((a) => ({
      staffId: a.staffRecord?.staffId || '',
      name: staffName(a.staffRecord),
      date: fmtDate(a.date),
      signIn: fmtDateTime(a.signInTime),
      signOut: fmtDateTime(a.signOutTime),
      status: a.status || ''
    }))
  )
}

async function buildRecruitment(workbook: ExcelJS.Workbook, companyId: string): Promise<number> {
  const [jobs, candidates, applications, offers] = await Promise.all([
    prisma.job.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } }),
    prisma.candidate.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } }),
    prisma.jobApplication.findMany({
      where: { companyId },
      include: { job: { select: { title: true } }, candidate: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.offer.findMany({
      where: { companyId },
      include: { candidate: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' }
    })
  ])

  const jobCount = addSheet(
    workbook,
    'Jobs',
    [
      { header: 'Title', key: 'title', width: 26 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Position', key: 'position', width: 20 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Employment Type', key: 'employmentType', width: 16 },
      { header: 'Created At', key: 'createdAt', width: 14 }
    ],
    jobs.map((j) => ({ title: j.title, department: j.department, position: j.position, status: j.status, employmentType: j.employmentType || '', createdAt: fmtDate(j.createdAt) }))
  )

  addSheet(
    workbook,
    'Candidates',
    [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Created At', key: 'createdAt', width: 14 }
    ],
    candidates.map((c) => ({ name: staffName(c), email: c.email, phone: c.phone || '', createdAt: fmtDate(c.createdAt) }))
  )

  addSheet(
    workbook,
    'Applications',
    [
      { header: 'Job', key: 'job', width: 26 },
      { header: 'Candidate', key: 'candidate', width: 24 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Score', key: 'score', width: 10 },
      { header: 'Applied At', key: 'createdAt', width: 14 }
    ],
    applications.map((a) => ({ job: a.job?.title || '', candidate: staffName(a.candidate), email: a.candidate?.email || '', status: a.status, score: a.score, createdAt: fmtDate(a.createdAt) }))
  )

  addSheet(
    workbook,
    'Offers',
    [
      { header: 'Candidate', key: 'candidate', width: 24 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Proposed Start', key: 'proposedStartDate', width: 16 },
      { header: 'Salary', key: 'salary', width: 14 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Sent At', key: 'sentAt', width: 14 },
      { header: 'Accepted At', key: 'acceptedAt', width: 14 }
    ],
    offers.map((o) => ({
      candidate: staffName(o.candidate),
      status: o.status,
      proposedStartDate: fmtDate(o.proposedStartDate),
      salary: fmtDecimal(o.salary),
      currency: o.currency || '',
      sentAt: fmtDate(o.sentAt),
      acceptedAt: fmtDate(o.acceptedAt)
    }))
  )

  return jobCount + candidates.length + applications.length + offers.length
}

async function buildOnboardingOffboarding(workbook: ExcelJS.Workbook, companyId: string): Promise<number> {
  const [onboardings, offboardings] = await Promise.all([
    prisma.onboarding.findMany({
      where: { companyId },
      include: { staffRecord: { select: { staffId: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.offboarding.findMany({
      where: { companyId },
      include: { staff: { select: { staffId: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' }
    })
  ])

  const onCount = addSheet(
    workbook,
    'Onboarding',
    [
      { header: 'Staff ID', key: 'staffId', width: 16 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Start Date', key: 'startDate', width: 14 },
      { header: 'Completed At', key: 'completedAt', width: 14 }
    ],
    onboardings.map((o) => ({
      staffId: o.staffRecord?.staffId || '',
      name: staffName(o.staffRecord),
      status: o.status,
      startDate: fmtDate(o.startDate),
      completedAt: fmtDate(o.completedAt)
    }))
  )

  addSheet(
    workbook,
    'Offboarding',
    [
      { header: 'Staff ID', key: 'staffId', width: 16 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Type', key: 'type', width: 16 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Submitted At', key: 'submittedAt', width: 14 },
      { header: 'Completed At', key: 'completedAt', width: 14 }
    ],
    offboardings.map((o) => ({
      staffId: o.staff?.staffId || '',
      name: staffName(o.staff),
      type: o.type,
      status: o.status,
      submittedAt: fmtDate(o.submittedAt),
      completedAt: fmtDate(o.completedAt)
    }))
  )

  return onCount + offboardings.length
}

async function buildTraining(workbook: ExcelJS.Workbook, companyId: string): Promise<number> {
  const [programs, certifications, attempts] = await Promise.all([
    prisma.trainingProgram.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } }),
    prisma.certificationRecord.findMany({
      where: { companyId },
      include: { employee: { select: { staffId: true, firstName: true, lastName: true } }, certificationType: { select: { name: true } } },
      orderBy: { issueDate: 'desc' }
    }),
    prisma.assessmentAttempt.findMany({
      where: { companyId },
      include: { employee: { select: { staffId: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' }
    })
  ])

  const progCount = addSheet(
    workbook,
    'Training Programs',
    [
      { header: 'Program Name', key: 'programName', width: 26 },
      { header: 'Category', key: 'category', width: 18 },
      { header: 'Type', key: 'trainingType', width: 16 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Start Date', key: 'startDate', width: 14 },
      { header: 'End Date', key: 'endDate', width: 14 }
    ],
    programs.map((p) => ({ programName: p.programName, category: p.category, trainingType: p.trainingType, status: p.status, startDate: fmtDate(p.startDate), endDate: fmtDate(p.endDate) }))
  )

  addSheet(
    workbook,
    'Certifications',
    [
      { header: 'Staff ID', key: 'staffId', width: 16 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Certification', key: 'certification', width: 22 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Issue Date', key: 'issueDate', width: 14 },
      { header: 'Expiry Date', key: 'expiryDate', width: 14 }
    ],
    certifications.map((c) => ({
      staffId: c.employee?.staffId || '',
      name: staffName(c.employee),
      certification: c.certificationType?.name || '',
      status: c.status,
      issueDate: fmtDate(c.issueDate),
      expiryDate: fmtDate(c.expiryDate)
    }))
  )

  addSheet(
    workbook,
    'Assessment Attempts',
    [
      { header: 'Staff ID', key: 'staffId', width: 16 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Attempt #', key: 'attemptNumber', width: 12 },
      { header: 'Outcome', key: 'outcome', width: 12 },
      { header: 'Score', key: 'score', width: 10 },
      { header: 'Completed At', key: 'completedAt', width: 14 }
    ],
    attempts.map((a) => ({
      staffId: a.employee?.staffId || '',
      name: staffName(a.employee),
      attemptNumber: a.attemptNumber,
      outcome: a.outcome || '',
      score: a.score,
      completedAt: fmtDate(a.completedAt)
    }))
  )

  return progCount + certifications.length + attempts.length
}

async function buildLoansBenefits(workbook: ExcelJS.Workbook, companyId: string): Promise<number> {
  const [loans, benefitRequests, allocations] = await Promise.all([
    prisma.loanRequest.findMany({
      where: { companyId },
      include: { staff: { select: { staffId: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.benefitRequest.findMany({
      where: { companyId },
      include: { staff: { select: { staffId: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.benefitAllocation.findMany({
      where: { companyId },
      include: { staff: { select: { staffId: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' }
    })
  ])

  const loanCount = addSheet(
    workbook,
    'Loan Requests',
    [
      { header: 'Staff ID', key: 'staffId', width: 16 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Loan Type', key: 'loanType', width: 14 },
      { header: 'Requested', key: 'requestedAmount', width: 14 },
      { header: 'Approved', key: 'approvedAmount', width: 14 },
      { header: 'Tenure (months)', key: 'tenureMonths', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Remaining Balance', key: 'remainingBalance', width: 16 }
    ],
    loans.map((l) => ({
      staffId: l.staff?.staffId || '',
      name: staffName(l.staff),
      loanType: l.loanType,
      requestedAmount: fmtDecimal(l.requestedAmount),
      approvedAmount: fmtDecimal(l.approvedAmount),
      tenureMonths: l.tenureMonths,
      status: l.status,
      remainingBalance: fmtDecimal(l.remainingBalance)
    }))
  )

  addSheet(
    workbook,
    'Benefit Requests',
    [
      { header: 'Staff ID', key: 'staffId', width: 16 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Benefit', key: 'benefitName', width: 20 },
      { header: 'Status', key: 'status', width: 14 }
    ],
    benefitRequests.map((b) => ({ staffId: b.staff?.staffId || '', name: staffName(b.staff), benefitName: b.benefitName, status: b.status }))
  )

  addSheet(
    workbook,
    'Benefit Allocations',
    [
      { header: 'Staff ID', key: 'staffId', width: 16 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Benefit', key: 'benefitName', width: 20 },
      { header: 'Amount', key: 'allocationAmount', width: 14 },
      { header: 'Status', key: 'status', width: 14 }
    ],
    allocations.map((a) => ({ staffId: a.staff?.staffId || '', name: staffName(a.staff), benefitName: a.benefitName, allocationAmount: fmtDecimal(a.allocationAmount), status: a.status }))
  )

  return loanCount + benefitRequests.length + allocations.length
}

const BUILDERS: Record<ExportDomain, (workbook: ExcelJS.Workbook, companyId: string, opts: BuildOpts) => Promise<number>> = {
  locations: (wb, companyId) => buildLocations(wb, companyId),
  orgStructure: (wb, companyId) => buildOrgStructure(wb, companyId),
  staff: (wb, companyId, opts) => buildStaff(wb, companyId, opts),
  payroll: (wb, companyId) => buildPayroll(wb, companyId),
  leave: (wb, companyId) => buildLeave(wb, companyId),
  attendance: (wb, companyId, opts) => buildAttendance(wb, companyId, opts),
  recruitment: (wb, companyId) => buildRecruitment(wb, companyId),
  onboardingOffboarding: (wb, companyId) => buildOnboardingOffboarding(wb, companyId),
  training: (wb, companyId) => buildTraining(wb, companyId),
  loansBenefits: (wb, companyId) => buildLoansBenefits(wb, companyId)
}

export async function generateCompanyExport(jobId: string): Promise<void> {
  const job = await prisma.companyExportJob.findUnique({ where: { id: jobId } })
  if (!job) return

  try {
    const company = await prisma.company.findUnique({ where: { id: job.companyId } })
    if (!company) throw new Error('Company not found')

    const domains = ((job.domains as string[]) || []).filter(isExportDomain)
    const opts: BuildOpts = {
      includeSensitiveData: job.includeSensitiveData,
      attendanceFrom: job.attendanceFrom,
      attendanceTo: job.attendanceTo
    }

    const workbook = new ExcelJS.Workbook()
    workbook.creator = '24/7HR'
    workbookContext.set(workbook, { companyName: company.companyName })
    // Added first so it's the first tab, populated last once row counts are known.
    const summarySheet = workbook.addWorksheet('Summary')

    const rowCounts: Record<string, number> = {}
    for (const domain of domains) {
      // eslint-disable-next-line no-await-in-loop
      rowCounts[domain] = await BUILDERS[domain](workbook, job.companyId, opts)
    }

    const summaryRows: Record<string, unknown>[] = [
      { field: 'Company', value: company.companyName },
      { field: 'Status', value: company.status },
      { field: 'Base Currency', value: company.baseCurrency },
      { field: 'Requested By', value: job.requestedBy },
      { field: 'Includes Sensitive Financial Data', value: job.includeSensitiveData ? 'Yes' : 'No' },
      { field: 'SECTION', value: 'ROWS', _section: true },
      ...domains.map((d) => ({ field: DOMAIN_LABELS[d], value: rowCounts[d] }))
    ]
    writeStyledTable(summarySheet, {
      title: 'Company Data Export',
      subtitle: buildSubtitle([company.companyName, `${domains.length} section${domains.length === 1 ? '' : 's'}`]),
      columns: [
        { header: 'Field', key: 'field', width: 36, align: 'left' },
        { header: 'Value', key: 'value', width: 50, align: 'left' }
      ],
      rows: summaryRows,
      autoFilter: false,
      onRow: (row, data) => {
        if (data._section) {
          row.eachCell((cell) => {
            cell.fill = solid(XL.TINT)
            cell.font = { bold: true, size: 10, color: argb(XL.BRAND_DEEP) }
          })
        }
      },
      footer: confidentialFooter(company.companyName)
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const dir = path.join(process.cwd(), 'uploads', 'company-exports', job.companyId)
    await mkdir(dir, { recursive: true })
    const fileName = `Company Data (${safeFileName(company.companyName)}) ${new Date().toISOString().slice(0, 10)}.xlsx`
    const absoluteFilePath = path.join(dir, `${jobId}.xlsx`)
    await writeFile(absoluteFilePath, Buffer.from(buffer as ArrayBuffer))

    await prisma.companyExportJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        filePath: path.relative(process.cwd(), absoluteFilePath),
        fileName,
        rowCounts,
        completedAt: new Date()
      }
    })
  } catch (error: any) {
    console.error('[COMPANY_EXPORT] Failed:', { jobId, error })
    await prisma.companyExportJob
      .update({ where: { id: jobId }, data: { status: 'FAILED', errorMessage: error?.message || 'Unknown error generating export' } })
      .catch((updateError) => {
        console.error('[COMPANY_EXPORT] Failed to mark job as FAILED:', { jobId, updateError })
      })
  }
}
