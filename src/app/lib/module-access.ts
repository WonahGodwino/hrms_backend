import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import type { AuthUser } from '@/app/lib/auth'
import type { ModuleKey } from '@/app/lib/modules'
import { PLATFORM_MODULES, DEFAULT_NAV_SECTIONS } from '@/app/lib/modules'

// Every platform role — for module routes that should not gate by role at all
// (access is decided by module membership + per-route scoping instead).
// Mirrors the meetings module's role set.
export const ALL_ROLES: string[] = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'STAFF']

// Checks whether the given company has a specific module enabled.
// Returns true for SUPER_ADMIN (they manage the platform, not a single company).
export async function hasModuleAccess(companyId: string | undefined, moduleKey: ModuleKey): Promise<boolean> {
  if (!companyId) return false
  const row = await (prisma as any).companyModuleAccess.findFirst({
    where: {
      companyId,
      enabled:  true,
      module:   { key: moduleKey },
    },
  })
  return !!row
}

// Drop-in replacement for requireRole in module-protected routes.
// Verifies the JWT + role, then checks the company's module access.
// SUPER_ADMIN bypasses the module check.
export async function requireModuleAccess(
  token:        string | null,
  moduleKey:    ModuleKey,
  allowedRoles: string[],
): Promise<AuthUser> {
  // Intentionally sync `requireRole` (reads the role from the JWT): temporary
  // role elevations are deliberately NOT honoured for module-gated routes, so an
  // elevation grants only limited rights (the async-guarded areas, e.g. the
  // interview panel) rather than full module access.
  const user = requireRole(token, allowedRoles)

  if (user.role === 'SUPER_ADMIN') return user

  const allowed = await hasModuleAccess(user.companyId, moduleKey)
  if (!allowed) {
    throw new Error('Insufficient permissions: This module is not available for your organisation')
  }

  return user
}

// Returns the keys of archived platform modules. Exposed to the client so
// the sidebar can hard-hide archived modules regardless of company access
// or role bypasses.
export async function getArchivedModuleKeys(): Promise<string[]> {
  const modules = await (prisma as any).platformModule.findMany({
    where:  { archived: true },
    select: { key: true },
  })
  return modules.map((m: { key: string }) => m.key)
}

// Returns the list of module keys enabled for a company.
// SUPER_ADMIN callers should pass undefined — they get all keys.
export async function getEnabledModules(companyId: string | undefined | null): Promise<string[]> {
  if (!companyId) {
    // SUPER_ADMIN or no company context — return all active (non-archived) keys
    const modules = await (prisma as any).platformModule.findMany({
      where:  { archived: false },
      select: { key: true },
    })
    return modules.map((m: { key: string }) => m.key)
  }
  const rows = await (prisma as any).companyModuleAccess.findMany({
    where:   { companyId, enabled: true, module: { archived: false } },
    include: { module: { select: { key: true } } },
  })
  return rows.map((r: any) => r.module.key as string)
}

// Seeds CompanyModuleAccess rows for a newly created company.
// Called from the company registration route after prisma.company.create().
// `enableKeys` overrides the default set (used by self-signup trials, which open
// every trial module); existing rows for those keys are switched on too.
export async function seedModuleAccessForCompany(companyId: string, enableKeys?: readonly string[]): Promise<void> {
  // REPORTS is a baseline capability — new companies get it enabled by default.
  const AUTO_ENABLE_KEYS = new Set<string>(enableKeys ?? ['REPORTS'])
  const modules = await (prisma as any).platformModule.findMany({
    where:  { archived: false },
    select: { id: true, key: true },
  })
  await (prisma as any).companyModuleAccess.createMany({
    data:           modules.map((m: { id: string, key: string }) => ({ companyId, moduleId: m.id, enabled: AUTO_ENABLE_KEYS.has(m.key) })),
    skipDuplicates: true,
  })
  if (enableKeys) {
    await (prisma as any).companyModuleAccess.updateMany({
      where: { companyId, module: { key: { in: [...AUTO_ENABLE_KEYS] } } },
      data:  { enabled: true },
    })
  }
}

// Seeds the default nav sections (Workforce / Operations / More) and assigns
// every module's default sidebar placement if it doesn't have one yet.
// Idempotent — safe to run on every sync.
export async function seedNavPlacement(): Promise<{ sectionsSeeded: number; modulesAssigned: number }> {
  // 1) Ensure default sections exist (match by label).
  const existingSections = await prisma.navSection.findMany()
  const byLabel = new Map(existingSections.map((s: { label: string }) => [s.label, s]))

  let sectionsSeeded = 0
  for (const def of DEFAULT_NAV_SECTIONS) {
    if (!byLabel.has(def.label)) {
      const created = await prisma.navSection.create({
        data: { label: def.label, sortOrder: def.sortOrder, isSystem: def.isSystem },
      })
      byLabel.set(def.label, created as any)
      sectionsSeeded += 1
    }
  }

  // 2) Assign each registered module its default placement if unassigned.
  //    Main-section modules (defaultSection null) get navSectionId null and
  //    rely on their navOrder for ordering within the main block.
  //    Also backfill name/description/navIcon from the registry so Module
  //    Setup mirrors the sidebar (registry icon as the default) — explicit
  //    overrides set by super admins are never overwritten.
  const modules = await (prisma as any).platformModule.findMany({ select: { id: true, key: true, navSectionId: true, navOrder: true, navIcon: true, name: true, description: true } })
  let modulesAssigned = 0
  for (const m of modules) {
    const def = PLATFORM_MODULES.find((p) => p.key === m.key)
    if (!def) continue
    const needsSection = !m.navSectionId && def.defaultSection
    const needsOrder = !m.navOrder && def.defaultOrder
    const needsIcon = !m.navIcon && def.icon
    const needsName = m.name !== def.name
    const needsDesc = m.description !== def.description
    if (needsSection || needsOrder || needsIcon || needsName || needsDesc) {
      const section = def.defaultSection ? byLabel.get(def.defaultSection) : null
      await (prisma as any).platformModule.update({
        where: { id: m.id },
        data: {
          ...(needsSection && section ? { navSectionId: (section as any).id } : {}),
          ...(needsOrder && def.defaultOrder ? { navOrder: def.defaultOrder } : {}),
          ...(needsIcon ? { navIcon: def.icon } : {}),
          ...(needsName ? { name: def.name } : {}),
          ...(needsDesc ? { description: def.description } : {}),
        },
      })
      modulesAssigned += 1
    }
  }

  return { sectionsSeeded, modulesAssigned }
}

// Upserts CompanyModuleAccess rows for every (company × module) pair that
// does not exist yet. Run after adding a new module to PLATFORM_MODULES.
export async function syncModuleAccess(): Promise<{ created: number }> {
  const [companies, modules] = await Promise.all([
    prisma.company.findMany({ where: { archived: 0 }, select: { id: true } }),
    (prisma as any).platformModule.findMany({ where: { archived: false }, select: { id: true, key: true } }),
  ])

  const existing = await (prisma as any).companyModuleAccess.findMany({
    select: { companyId: true, moduleId: true },
  })
  const existingSet = new Set(existing.map((r: any) => `${r.companyId}:${r.moduleId}`))

  // Modules that start ENABLED for every new access row (reporting is a
  // baseline capability every company gets).
  const AUTO_ENABLE_KEYS = new Set(['REPORTS'])

  const toCreate: { companyId: string; moduleId: string; enabled: boolean }[] = []
  for (const company of companies) {
    for (const module of modules) {
      if (!existingSet.has(`${company.id}:${module.id}`)) {
        const enabled = AUTO_ENABLE_KEYS.has((module as any).key)
        toCreate.push({ companyId: company.id, moduleId: module.id, enabled })
      }
    }
  }

  if (toCreate.length > 0) {
    await (prisma as any).companyModuleAccess.createMany({ data: toCreate, skipDuplicates: true })
  }

  return { created: toCreate.length }
}
