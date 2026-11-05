// src/app/lib/core-setup/readiness.ts
//
// Core Setup readiness intelligence.
//
// Computes, per company, how complete each guided-setup stage is by inspecting
// REAL configuration state — not just whether a record exists, but whether the
// records are actually usable:
//
//   01 Company        — profile completeness (identity/contact/currency/pay dates)
//   02 Organization   — business units, departments, % with heads, BU mapping
//   03 Roles & Levels — designations
//   04 People         — active staff, % with department/designation assigned
//   05 Payroll Setup  — company-owned templates with earning/deduction sections
//
// Each stage produces: score (0-100), status, and a requirements checklist
// with per-requirement done/detail. Stage statuses encode the journey order:
// the first incomplete stage is "current" (or "ready" for stage 1), later
// ones are "upcoming" (locked), and a completed stage with quality issues
// becomes "needs_attention".
import { prisma } from '@/app/lib/db'

export type StageKey = 'company' | 'organization' | 'roles' | 'people' | 'payroll'
export type StageStatus = 'completed' | 'current' | 'ready' | 'upcoming' | 'needs_attention'

export interface Requirement {
  label: string
  done: boolean
  detail?: string
}

export interface StageReadiness {
  key: StageKey
  name: string
  num: string
  score: number // 0-100
  status: StageStatus
  requirements: Requirement[]
}

export interface SetupIssue {
  stage: StageKey
  severity: 'warning' | 'info'
  message: string
  action: string
  href: string
}

export interface ReadinessResult {
  progress: number
  stages: StageReadiness[]
  issues: SetupIssue[]
}

const pct = (done: number, total: number) => (total === 0 ? 0 : Math.round((done / total) * 100))

// ---------------------------------------------------------------------------
// Stage computation
// ---------------------------------------------------------------------------

async function computeCompany(companyId: string): Promise<StageReadiness> {
  const [company, payDateCount] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        companyName: true, tradingName: true, industry: true, website: true,
        address: true, phone: true, email: true, baseCurrency: true,
      },
    }),
    (prisma as any).companyPayDate.count({ where: { companyId, isActive: true } }),
  ])

  const profileFields: Array<[string, unknown]> = [
    ['Trading name', company?.tradingName],
    ['Industry', company?.industry],
    ['Website', company?.website],
    ['Address', company?.address],
    ['Phone', company?.phone],
  ]
  const filledProfile = profileFields.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '').length

  const requirements: Requirement[] = [
    { label: 'Organization identity', done: !!company?.companyName, detail: company?.companyName },
    { label: 'Contact details', done: filledProfile >= 3, detail: `${filledProfile}/5 profile fields filled` },
    { label: 'Currency', done: !!company?.baseCurrency, detail: company?.baseCurrency ?? 'Not set' },
    { label: 'Pay dates', done: payDateCount > 0, detail: payDateCount > 0 ? `${payDateCount} configured` : 'None configured' },
  ]

  const score = Math.round(
    (requirements.filter((r) => r.done).length / requirements.length) * 100
  )
  return { key: 'company', name: 'Company', num: '01', score, status: 'completed', requirements }
}

async function computeOrganization(companyId: string): Promise<StageReadiness> {
  const [buCount, departments] = await Promise.all([
    (prisma as any).businessUnit.count({ where: { companyId } }),
    (prisma as any).department.findMany({
      where: { companyId },
      select: { headId: true, businessUnitId: true },
    }),
  ])

  const deptCount = departments.length
  const withHead = departments.filter((d: any) => d.headId).length
  const withBu = departments.filter((d: any) => d.businessUnitId).length

  const requirements: Requirement[] = [
    { label: 'Business units', done: buCount > 0, detail: `${buCount} configured` },
    { label: 'Departments', done: deptCount > 0, detail: `${deptCount} configured` },
    {
      label: 'Department heads',
      done: deptCount > 0 && withHead === deptCount,
      detail: deptCount === 0 ? 'Add departments first' : `${withHead}/${deptCount} assigned`,
    },
    {
      label: 'Departments mapped to business units',
      done: deptCount > 0 && withBu === deptCount,
      detail: deptCount === 0 ? 'Add departments first' : `${withBu}/${deptCount} mapped`,
    },
  ]

  // Weighted score: existence matters, but head/BU coverage counts too.
  const score = Math.round(
    (buCount > 0 ? 25 : 0) +
    (deptCount > 0 ? 25 : 0) +
    (deptCount > 0 ? (withHead / deptCount) * 25 : 0) +
    (deptCount > 0 ? (withBu / deptCount) * 25 : 0)
  )
  return { key: 'organization', name: 'Organization', num: '02', score, status: 'completed', requirements }
}

async function computeRoles(companyId: string): Promise<StageReadiness> {
  const designationCount = await (prisma as any).designation.count({ where: { companyId } })

  const requirements: Requirement[] = [
    { label: 'Designations', done: designationCount > 0, detail: `${designationCount} configured` },
  ]

  const score = designationCount > 0 ? 100 : 0
  return { key: 'roles', name: 'Roles & Levels', num: '03', score, status: 'completed', requirements }
}

async function computePeople(companyId: string): Promise<StageReadiness> {
  const staff = await (prisma as any).staffRecord.findMany({
    where: { companyId, isActive: true },
    select: { departmentId: true, designationId: true },
  })

  const staffCount = staff.length
  const withDept = staff.filter((s: any) => s.departmentId).length
  const withDesig = staff.filter((s: any) => s.designationId).length

  const requirements: Requirement[] = [
    { label: 'Staff records', done: staffCount > 0, detail: `${staffCount} active` },
    {
      label: 'Department assignment',
      done: staffCount > 0 && withDept === staffCount,
      detail: staffCount === 0 ? 'Register staff first' : `${withDept}/${staffCount} assigned`,
    },
    {
      label: 'Designation assignment',
      done: staffCount > 0 && withDesig === staffCount,
      detail: staffCount === 0 ? 'Register staff first' : `${withDesig}/${staffCount} assigned`,
    },
  ]

  const score = Math.round(
    (staffCount > 0 ? 40 : 0) +
    (staffCount > 0 ? (withDept / staffCount) * 30 : 0) +
    (staffCount > 0 ? (withDesig / staffCount) * 30 : 0)
  )
  return { key: 'people', name: 'People', num: '04', score, status: 'completed', requirements }
}

async function computePayroll(companyId: string): Promise<StageReadiness> {
  const templates = await (prisma as any).payrollTemplate.findMany({
    where: { companyId },
    select: {
      id: true,
      fields: { select: { section: true } },
      _count: { select: { payrolls: true } },
    },
  })

  const templateCount = templates.length
  const withEarnings = templates.filter((t: any) =>
    t.fields.some((f: any) => f.section === 'EARNINGS' || f.section === 'FIXED_EARNINGS')
  ).length
  const withDeductions = templates.filter((t: any) =>
    t.fields.some((f: any) => f.section === 'DEDUCTIONS')
  ).length

  const requirements: Requirement[] = [
    { label: 'Payroll template', done: templateCount > 0, detail: `${templateCount} configured` },
    {
      label: 'Earning components',
      done: templateCount > 0 && withEarnings > 0,
      detail: templateCount === 0 ? 'Create a template first' : `${withEarnings}/${templateCount} templates`,
    },
    {
      label: 'Deduction components',
      done: templateCount > 0 && withDeductions > 0,
      detail: templateCount === 0 ? 'Create a template first' : `${withDeductions}/${templateCount} templates`,
    },
  ]

  const score = Math.round(
    (templateCount > 0 ? 40 : 0) +
    (templateCount > 0 ? (withEarnings / templateCount) * 30 : 0) +
    (templateCount > 0 ? (withDeductions / templateCount) * 30 : 0)
  )
  return { key: 'payroll', name: 'Payroll Setup', num: '05', score, status: 'completed', requirements }
}

// ---------------------------------------------------------------------------
// Orchestrator — statuses + issues + weighted progress
// ---------------------------------------------------------------------------

export async function computeReadiness(companyId: string): Promise<ReadinessResult> {
  const stages = await Promise.all([
    computeCompany(companyId),
    computeOrganization(companyId),
    computeRoles(companyId),
    computePeople(companyId),
    computePayroll(companyId),
  ])

  // Journey statuses: complete stages ✓ (with issues → needs_attention),
  // first incomplete is current/ready, the rest upcoming (locked).
  const firstIncomplete = stages.findIndex((s) => s.score < 100)

  stages.forEach((stage, i) => {
    const complete = stage.score >= 100
    if (complete) {
      stage.status = 'completed' // upgraded to needs_attention below if issues exist
    } else if (i === firstIncomplete) {
      stage.status = i === 0 ? 'ready' : 'current'
    } else {
      stage.status = 'upcoming'
    }
  })

  // Issues — actionable quality problems on otherwise-completed stages.
  const issues: SetupIssue[] = []
  for (const stage of stages) {
    for (const req of stage.requirements) {
      if (!req.done && stage.score >= 100) continue // can't happen (score 100 = all done) — defensive
      if (!req.done && stage.score < 100) {
        // Part of an incomplete stage — only surface as an issue when the
        // stage is otherwise far along (≥ 50%) so early stages aren't noisy.
        if (stage.score >= 50) {
          issues.push({
            stage: stage.key,
            severity: 'warning',
            message: `${stage.name}: ${req.label} incomplete (${req.detail ?? ''})`.trim(),
            action: `Open ${stage.name}`,
            href: stageHref(stage.key),
          })
        }
      }
    }
  }

  // Completed stages with structural gaps → needs_attention (drawn from
  // requirement detail: e.g. departments without heads, staff w/o grades).
  for (const stage of stages) {
    if (stage.status !== 'completed') continue
    const partial = stage.requirements.find((r) => r.done && /\d+\/\d+/.test(r.detail ?? '') )
    if (partial) {
      const [done, total] = (partial.detail!.match(/(\d+)\/(\d+)/) ?? []).slice(1).map(Number)
      if (done < total) stage.status = 'needs_attention'
    }
  }

  // Weighted progress: partial stage scores count toward the total.
  const progress = Math.round(stages.reduce((sum, s) => sum + s.score, 0) / stages.length)

  return { progress, stages, issues }
}

export function stageHref(key: StageKey): string {
  switch (key) {
    case 'company': return '/companies'
    case 'organization': return '/business-units'
    case 'roles': return '/designations'
    case 'people': return '/staff-management'
    case 'payroll': return '/templates'
  }
}
