// Generic company scoping for Core Setup reads (departments, designations,
// grade levels, etc.), honouring the global company switcher sent as a
// `companyId` query param, with per-role access:
//   - SUPER_ADMIN: may target any non-archived company; no param → undefined
//                  (caller decides whether that means "all" or "required").
//   - ADMIN:       may target a company they are assigned to (ADMIN/ALL);
//                  otherwise falls back to their token company.
//   - HR/MANAGER/STAFF: always locked to their own token company (param ignored).
//
// This is the non-recruitment counterpart to resolveRecruitmentCompanyId and
// exists so every Core Setup list/stats endpoint scopes consistently.
import { prisma } from '@/app/lib/db'

export interface ScopedCompanyResult {
  companyId?: string
  forbidden?: boolean
}

export async function resolveScopedCompanyId(
  user: { role: string; userId?: string; companyId?: string | null },
  requestedCompanyId?: string | null,
): Promise<ScopedCompanyResult> {
  const requested = requestedCompanyId?.trim() || null

  if (user.role === 'SUPER_ADMIN') {
    if (requested) {
      const exists = await prisma.company.findFirst({
        where: { id: requested, archived: 0 },
        select: { id: true },
      })
      if (exists) return { companyId: requested }
      return { forbidden: true }
    }
    // No explicit selection → unscoped (caller decides: all vs. required).
    return { companyId: user.companyId ?? undefined }
  }

  if (user.role === 'ADMIN') {
    if (requested) {
      const assigned = await prisma.userCompany.findFirst({
        where: { userId: user.userId, companyId: requested, role: { in: ['ADMIN', 'ALL'] } },
        select: { id: true },
      })
      if (assigned) return { companyId: requested }
      // Requested a company they can't access → fall back to their own.
      return { companyId: user.companyId ?? undefined }
    }
    return { companyId: user.companyId ?? undefined }
  }

  // HR / MANAGER / STAFF — always their own company.
  return { companyId: user.companyId ?? undefined }
}
