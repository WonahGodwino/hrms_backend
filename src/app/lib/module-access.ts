import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import type { AuthUser } from '@/app/lib/auth'
import type { ModuleKey } from '@/app/lib/modules'

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
    throw new Error('This module is not available for your organisation')
  }

  return user
}

// Returns the list of module keys enabled for a company.
// SUPER_ADMIN callers should pass undefined — they get all keys.
export async function getEnabledModules(companyId: string | undefined | null): Promise<string[]> {
  if (!companyId) {
    // SUPER_ADMIN or no company context — return all module keys
    const modules = await (prisma as any).platformModule.findMany({ select: { key: true } })
    return modules.map((m: { key: string }) => m.key)
  }
  const rows = await (prisma as any).companyModuleAccess.findMany({
    where:   { companyId, enabled: true },
    include: { module: { select: { key: true } } },
  })
  return rows.map((r: any) => r.module.key as string)
}

// Seeds CompanyModuleAccess rows for a newly created company.
// Called from the company registration route after prisma.company.create().
export async function seedModuleAccessForCompany(companyId: string): Promise<void> {
  const modules = await (prisma as any).platformModule.findMany({ select: { id: true } })
  await (prisma as any).companyModuleAccess.createMany({
    data:           modules.map((m: { id: string }) => ({ companyId, moduleId: m.id, enabled: false })),
    skipDuplicates: true,
  })
}

// Upserts CompanyModuleAccess rows for every (company × module) pair that
// does not exist yet. Run after adding a new module to PLATFORM_MODULES.
export async function syncModuleAccess(): Promise<{ created: number }> {
  const [companies, modules] = await Promise.all([
    prisma.company.findMany({ where: { archived: 0 }, select: { id: true } }),
    (prisma as any).platformModule.findMany({ select: { id: true } }),
  ])

  const existing = await (prisma as any).companyModuleAccess.findMany({
    select: { companyId: true, moduleId: true },
  })
  const existingSet = new Set(existing.map((r: any) => `${r.companyId}:${r.moduleId}`))

  const toCreate: { companyId: string; moduleId: string; enabled: boolean }[] = []
  for (const company of companies) {
    for (const module of modules) {
      if (!existingSet.has(`${company.id}:${module.id}`)) {
        toCreate.push({ companyId: company.id, moduleId: module.id, enabled: false })
      }
    }
  }

  if (toCreate.length > 0) {
    await (prisma as any).companyModuleAccess.createMany({ data: toCreate, skipDuplicates: true })
  }

  return { created: toCreate.length }
}
