// src/app/lib/recruitment/page-access.ts
//
// Department/designation-based access for designation-scoped Recruitment
// admin pages. Modeled on staff-loans-benefits/page-access.ts, but with one
// deliberate behavioral difference: designation-scoping here is strictly
// OPT-IN per page, and once a page IS scoped, SUPER_ADMIN gets no automatic
// bypass — it is checked against the configured department/designation
// allow-list exactly like any other role.
//
//   - No RecruitmentPageAccess row for a pageKey → unrestricted (the page
//     was never configured, so everyone — including SUPER_ADMIN — passes).
//   - A row exists → only staff whose departmentId/designationId appears in
//     the configured allow-lists pass. This applies to SUPER_ADMIN too: a
//     page an admin has explicitly scoped to specific designations is never
//     bypassed by platform role.
//
// This is the opposite default from the Loans & Benefits precedent, which
// locks a page down to SUPER_ADMIN-only until configured.
import { prisma } from '@/app/lib/db'

export type PageKey = string

export async function canAccessRecruitmentPage(pageKey: PageKey, user: { role: string; userId: string; companyId?: string | null }): Promise<boolean> {
  // No company context (e.g. a SUPER_ADMIN acting outside any single
  // company) — nothing could have been configured for this user, so the
  // page is unrestricted.
  if (!user.companyId) return true

  const config = await prisma.recruitmentPageAccess.findUnique({
    where: { companyId_pageKey: { companyId: user.companyId, pageKey } },
  })
  // Unconfigured pages are unrestricted — opt-in scoping only.
  if (!config) return true

  const staff = await prisma.staffRecord.findUnique({
    where: { id: user.userId },
    select: { departmentId: true, designationId: true },
  })
  if (!staff) return false

  const deptIds = (config.departmentIds as string[]) || []
  const desigIds = (config.designationIds as string[]) || []

  return (!!staff.departmentId && deptIds.includes(staff.departmentId)) || (!!staff.designationId && desigIds.includes(staff.designationId))
}

// Resolves every Recruitment pageKey the given user currently has access
// to, out of the set of pageKeys that have been configured for the user's
// company — used by the frontend's single "my-access" fetch (nav + route
// guard). Deliberately does NOT short-circuit for SUPER_ADMIN — see the
// file-level note above.
export async function resolveAccessibleRecruitmentPages(user: { role: string; userId: string; companyId?: string | null }): Promise<PageKey[]> {
  if (!user.companyId) return []

  const rows = await prisma.recruitmentPageAccess.findMany({
    where: { companyId: user.companyId },
    select: { pageKey: true },
  })
  const configuredKeys = rows.map((r) => r.pageKey)
  if (configuredKeys.length === 0) return []

  const results = await Promise.all(configuredKeys.map((key) => canAccessRecruitmentPage(key, user)))
  return configuredKeys.filter((_, i) => results[i])
}

// Every pageKey that currently HAS a RecruitmentPageAccess row for this
// company — i.e. every page that is actually scoped. The frontend needs
// this alongside resolveAccessibleRecruitmentPages() because plain list
// inclusion can't distinguish "unconfigured (always allowed)" from
// "configured and denied": a pageKey absent from BOTH lists is unrestricted;
// present here but not in resolveAccessibleRecruitmentPages() means denied.
export async function listConfiguredRecruitmentPageKeys(companyId?: string | null): Promise<PageKey[]> {
  if (!companyId) return []
  const rows = await prisma.recruitmentPageAccess.findMany({
    where: { companyId },
    select: { pageKey: true },
  })
  return rows.map((r) => r.pageKey)
}
