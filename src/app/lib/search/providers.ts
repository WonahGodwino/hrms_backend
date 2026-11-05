// src/app/lib/search/providers.ts
//
// Record providers behind GET /api/search. Each one is gated by the company's enabled module
// and the caller's role, uses a minimal `select`, and is capped, so a search stays one cheap
// fan-out. Results carry only a title, subtitle, status and deep link, never sensitive fields.
import { prisma } from '@/app/lib/db'
import type { ModuleKey } from '@/app/lib/modules'

export type SearchResult = {
  type: string
  id: string
  title: string
  subtitle: string
  status?: string
  href: string
}

export type SearchContext = {
  userId: string
  role: string
  companyId: string
}

export type SearchProvider = {
  type: string
  label: string
  moduleKey: ModuleKey
  roles: string[]
  keywords: string[]
  emailFriendly?: boolean
  search: (ctx: SearchContext, tokens: string[], raw: string, limit: number) => Promise<SearchResult[]>
}

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR']
const ALL = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'STAFF']

const insensitive = 'insensitive' as const
const startsWith = (v: string) => ({ startsWith: v, mode: insensitive })
const contains = (v: string) => ({ contains: v, mode: insensitive })

const fmtDate = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

// Every token must match the first or last name (so "john smi" finds John Smith).
const nameTokensWhere = (tokens: string[], extra: (t: string) => any[] = () => []) => ({
  AND: tokens.map((t) => ({ OR: [{ firstName: startsWith(t) }, { lastName: startsWith(t) }, ...extra(t)] })),
})

export const SEARCH_PROVIDERS: SearchProvider[] = [
  {
    type: 'staff',
    label: 'People',
    moduleKey: 'CORE_SETUP',
    roles: ADMIN_ROLES,
    keywords: ['staff', 'people', 'person', 'employee', 'employees'],
    emailFriendly: true,
    async search(ctx, tokens, raw, limit) {
      const where = raw.includes('@')
        ? { companyId: ctx.companyId, email: startsWith(raw) }
        : { companyId: ctx.companyId, ...nameTokensWhere(tokens, (t) => [{ staffId: startsWith(t) }, { email: startsWith(t) }]) }
      const rows = await prisma.staffRecord.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
        take: limit,
        select: { id: true, staffId: true, firstName: true, lastName: true, department: true, position: true, isActive: true },
      })
      return rows.map((r) => ({
        type: 'staff',
        id: r.id,
        title: `${r.firstName} ${r.lastName}`,
        subtitle: [r.staffId, r.position, r.department].filter(Boolean).join(' | '),
        status: r.isActive ? undefined : 'Inactive',
        href: `/staff-management/${r.id}`,
      }))
    },
  },
  {
    type: 'department',
    label: 'Departments',
    moduleKey: 'CORE_SETUP',
    roles: ADMIN_ROLES,
    keywords: ['department', 'departments', 'dept'],
    async search(ctx, tokens, raw, limit) {
      const rows = await prisma.department.findMany({
        where: { companyId: ctx.companyId, OR: [{ name: contains(raw) }, { code: startsWith(raw) }] },
        orderBy: { name: 'asc' },
        take: limit,
        select: { id: true, name: true, code: true, status: true },
      })
      return rows.map((r) => ({ type: 'department', id: r.id, title: r.name, subtitle: `Code ${r.code}`, status: r.status, href: '/departments' }))
    },
  },
  {
    type: 'designation',
    label: 'Designations',
    moduleKey: 'CORE_SETUP',
    roles: ADMIN_ROLES,
    keywords: ['designation', 'designations', 'role', 'position'],
    async search(ctx, tokens, raw, limit) {
      const rows = await prisma.designation.findMany({
        where: { companyId: ctx.companyId, OR: [{ title: contains(raw) }, { code: startsWith(raw) }] },
        orderBy: { title: 'asc' },
        take: limit,
        select: { id: true, title: true, code: true, status: true },
      })
      return rows.map((r) => ({ type: 'designation', id: r.id, title: r.title, subtitle: `Code ${r.code}`, status: r.status, href: '/designations' }))
    },
  },
  {
    type: 'leave',
    label: 'Leave requests',
    moduleKey: 'LEAVE',
    roles: ALL,
    keywords: ['leave', 'leaves', 'absence', 'pto', 'vacation'],
    async search(ctx, tokens, raw, limit) {
      const isAdmin = ADMIN_ROLES.includes(ctx.role)
      const where: any = isAdmin
        ? {
            companyId: ctx.companyId,
            OR: [
              { referenceNumber: startsWith(raw) },
              { staffRecord: nameTokensWhere(tokens) },
              ...(tokens.length === 1 ? [{ status: { equals: raw.toUpperCase() } }] : []),
            ],
          }
        : // Staff only ever see their own requests.
          { companyId: ctx.companyId, staffRecordId: ctx.userId, OR: [{ referenceNumber: startsWith(raw) }, { status: { equals: raw.toUpperCase() } }] }
      const rows = await prisma.leaveRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          referenceNumber: true,
          status: true,
          startDate: true,
          endDate: true,
          staffRecord: { select: { firstName: true, lastName: true } },
        },
      })
      return rows.map((r) => ({
        type: 'leave',
        id: r.id,
        title: isAdmin ? `${r.staffRecord.firstName} ${r.staffRecord.lastName}` : 'My leave request',
        subtitle: `${fmtDate(r.startDate)} to ${fmtDate(r.endDate)}${r.referenceNumber ? ` | ${r.referenceNumber}` : ''}`,
        status: r.status,
        href: '/leave-dashboard',
      }))
    },
  },
  {
    type: 'training',
    label: 'Training programs',
    moduleKey: 'TRAINING',
    roles: ADMIN_ROLES,
    keywords: ['training', 'trainings', 'course', 'program', 'programs'],
    async search(ctx, tokens, raw, limit) {
      const rows = await prisma.trainingProgram.findMany({
        where: { companyId: ctx.companyId, OR: [{ programName: contains(raw) }, { category: contains(raw) }] },
        orderBy: { startDate: 'desc' },
        take: limit,
        select: { id: true, programName: true, category: true, startDate: true },
      })
      return rows.map((r) => ({ type: 'training', id: r.id, title: r.programName, subtitle: `${r.category} | starts ${fmtDate(r.startDate)}`, href: '/training/programs' }))
    },
  },
  {
    type: 'job',
    label: 'Jobs',
    moduleKey: 'RECRUITMENT',
    roles: ADMIN_ROLES,
    keywords: ['job', 'jobs', 'vacancy', 'vacancies', 'opening'],
    async search(ctx, tokens, raw, limit) {
      const rows = await prisma.job.findMany({
        where: { companyId: ctx.companyId, OR: [{ title: contains(raw) }, { department: contains(raw) }] },
        orderBy: { title: 'asc' },
        take: limit,
        select: { id: true, title: true, department: true, status: true },
      })
      return rows.map((r) => ({ type: 'job', id: r.id, title: r.title, subtitle: r.department, status: String(r.status), href: `/jobs/${r.id}/details` }))
    },
  },
  {
    type: 'candidate',
    label: 'Candidates',
    moduleKey: 'RECRUITMENT',
    roles: ADMIN_ROLES,
    keywords: ['candidate', 'candidates', 'applicant', 'applicants'],
    emailFriendly: true,
    async search(ctx, tokens, raw, limit) {
      const where = raw.includes('@')
        ? { companyId: ctx.companyId, email: startsWith(raw) }
        : { companyId: ctx.companyId, ...nameTokensWhere(tokens, (t) => [{ email: startsWith(t) }]) }
      const rows = await prisma.candidate.findMany({
        where,
        orderBy: { firstName: 'asc' },
        take: limit,
        select: { id: true, firstName: true, lastName: true, email: true },
      })
      return rows.map((r) => ({ type: 'candidate', id: r.id, title: `${r.firstName} ${r.lastName}`, subtitle: r.email, href: '/talent-pool' }))
    },
  },
  {
    type: 'payroll',
    label: 'Payroll uploads',
    moduleKey: 'PAYROLL',
    roles: ADMIN_ROLES,
    keywords: ['payroll', 'payslip', 'payslips', 'salary'],
    async search(ctx, tokens, raw, limit) {
      const rows = await prisma.payrollUpload.findMany({
        where: { companyId: ctx.companyId, fileName: contains(raw) },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, fileName: true, status: true, createdAt: true },
      })
      return rows.map((r) => ({ type: 'payroll', id: r.id, title: r.fileName, subtitle: `Uploaded ${fmtDate(r.createdAt)}`, status: String(r.status), href: '/payroll-dashboard' }))
    },
  },
]

export const SEARCH_GROUP_LABELS: Record<string, string> = Object.fromEntries(SEARCH_PROVIDERS.map((p) => [p.type, p.label]))
