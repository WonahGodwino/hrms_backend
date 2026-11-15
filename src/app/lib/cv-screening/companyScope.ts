// Resolves the effective company scope for CV Screening reads/writes, honouring
// the caller's global company selection while enforcing per-role access. Kept as
// its own copy (not a re-export of recruitment/companyScope.ts's
// resolveRecruitmentCompanyId) so this module has no dependency on recruitment;
// the two modules' company-scoping rules may diverge later without coupling them.
//   - HR:          always locked to their own company (param ignored).
//   - ADMIN:       may target any company they are assigned to (ADMIN/ALL).
//   - SUPER_ADMIN: may target any non-archived company.
import { prisma } from '@/app/lib/db'

export interface CompanyScopeResult {
  companyId?: string
  error?: { message: string; status: number }
}

export async function resolveCvScreeningCompanyId(
  user: { role: string; userId?: string; companyId?: string | null },
  requestedCompanyId?: string | null
): Promise<CompanyScopeResult> {
  const requested = requestedCompanyId?.trim() || null

  if (user.role === 'HR') {
    if (!user.companyId) {
      return { error: { message: 'Company context missing for this user', status: 400 } }
    }
    return { companyId: user.companyId }
  }

  if (user.role === 'ADMIN') {
    if (requested) {
      const assigned = await prisma.userCompany.findFirst({
        where: { userId: user.userId, companyId: requested, role: { in: ['ADMIN', 'ALL'] } },
        select: { id: true },
      })
      if (!assigned) {
        return { error: { message: 'You do not have access to this company', status: 403 } }
      }
      return { companyId: requested }
    }
    if (!user.companyId) {
      return { error: { message: 'Company context missing for this user', status: 400 } }
    }
    return { companyId: user.companyId }
  }

  // SUPER_ADMIN
  if (requested) {
    const exists = await prisma.company.findFirst({
      where: { id: requested, archived: 0 },
      select: { id: true },
    })
    if (!exists) {
      return { error: { message: 'Company not found or is archived', status: 404 } }
    }
    return { companyId: requested }
  }
  if (!user.companyId) {
    return { error: { message: 'A companyId is required', status: 400 } }
  }
  return { companyId: user.companyId }
}
