// src/app/lib/payroll/seed-system-payroll-templates.ts
//
// Out-of-the-box built-in payroll templates. ISURF_STANDARD and BLUERIDGE are
// processed by the hardcoded processors in ./templates/, but the payroll
// dashboard, upload modal and template dashboard list templates from the DB
// (GET /payroll/template/dynamic?includeSystem=true). Each built-in therefore
// needs a PayrollTemplate row with isSystem = true and templateName equal to
// its PAYROLL_TEMPLATES key — the frontend sends that name back as the
// templateType for upload/download.
//
// Unlike the per-company payslip preset, these rows are global (every company
// sees isSystem rows), so instead of seeding on company registration they're
// ensured lazily: the template list endpoint calls ensureSystemPayrollTemplates()
// before querying. It runs once per server process; a fresh environment (or a
// database that never had the rows) self-heals on the first template list.
//
// companyId is only required by the FK — rows are attached to the oldest
// company (override with SYSTEM_TEMPLATE_COMPANY_ID).
import { prisma } from '@/app/lib/db'
import { PAYROLL_TEMPLATES } from './templates/types'

export const SYSTEM_PAYROLL_TEMPLATE_KEYS = Object.keys(PAYROLL_TEMPLATES) as Array<keyof typeof PAYROLL_TEMPLATES>

const EMPTY_SECTIONS = {
  STAFF_DETAILS: [],
  FIXED_EARNINGS: [],
  FIXED_VALUES: [],
  EARNINGS: [],
  DEDUCTIONS: [],
  EMPLOYER_COST: [],
}

// Arbitrary constant key for the Postgres advisory lock that serializes the
// check-then-create across concurrent requests / server instances.
const ADVISORY_LOCK_KEY = 247_001_002

export async function seedSystemPayrollTemplates(actor = 'SYSTEM_SEED'): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`

    const existing = await tx.payrollTemplate.findMany({
      where: { isSystem: true, templateName: { in: SYSTEM_PAYROLL_TEMPLATE_KEYS } },
      select: { templateName: true },
    })
    const have = new Set(existing.map((t) => t.templateName))
    const missing = SYSTEM_PAYROLL_TEMPLATE_KEYS.filter((k) => !have.has(k))
    if (missing.length === 0) return []

    const ownerId = process.env.SYSTEM_TEMPLATE_COMPANY_ID
    const owner = ownerId
      ? await tx.company.findUnique({ where: { id: ownerId }, select: { id: true } })
      : await tx.company.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
    // No company yet (brand-new install) — nothing to attach to; try again later.
    if (!owner) return []

    for (const key of missing) {
      await tx.payrollTemplate.create({
        data: {
          companyId: owner.id,
          templateName: key,
          sections: EMPTY_SECTIONS,
          isSystem: true,
          createdBy: actor,
        },
      })
    }
    return missing
  })
}

let ensured: Promise<void> | null = null

/**
 * Makes sure the built-in system payroll templates exist. Cheap after the
 * first successful call in a process. Never throws — a failure is logged and
 * retried on the next call so template listing is never blocked by it.
 */
export function ensureSystemPayrollTemplates(): Promise<void> {
  if (!ensured) {
    ensured = seedSystemPayrollTemplates()
      .then((created) => {
        if (created.length) console.log('[payroll] seeded system templates:', created.join(', '))
      })
      .catch((err) => {
        ensured = null
        console.warn('[payroll] could not ensure system templates:', err)
      })
  }
  return ensured
}
