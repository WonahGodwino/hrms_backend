// src/app/lib/reporting/access.ts
//
// Shared company-access resolution for the reporting module (Finance Report,
// Staff Insights). Extracted from salary-summary/route.ts so the same
// SUPER_ADMIN-sees-all / HR-own-company / ADMIN-selectable rules apply
// identically across every reporting endpoint.
import { prisma } from '@/app/lib/db'

export type AccessibleCompany = {
  companyId: string
  companyName: string
}

export async function getAccessibleCompanies(user: any): Promise<AccessibleCompany[]> {
  if (user.role === 'SUPER_ADMIN') {
    const companies = await prisma.company.findMany({
      where: { archived: 0 },
      select: { id: true, companyName: true },
      orderBy: { companyName: 'asc' }
    })
    return companies.map((c) => ({ companyId: c.id, companyName: c.companyName || '' }))
  }

  const userCompanies = await prisma.userCompany.findMany({
    where: { userId: user.userId, company: { archived: 0 } },
    select: { companyId: true, company: { select: { companyName: true } } },
    orderBy: { company: { companyName: 'asc' } }
  })

  const mapped = userCompanies.map((uc) => ({ companyId: uc.companyId, companyName: uc.company?.companyName || '' }))
  if (mapped.length > 0) return mapped

  if (!user.companyId) return []

  const fallbackCompany = await prisma.company.findFirst({
    where: { id: user.companyId, archived: 0 },
    select: { id: true, companyName: true }
  })

  if (!fallbackCompany) return []

  return [{ companyId: fallbackCompany.id, companyName: fallbackCompany.companyName || '' }]
}

// Resolves which company id(s) a request should be scoped to, given the
// caller's role and an optional explicit ?companyId= — same rules
// salary-summary/route.ts already enforces:
//  - SUPER_ADMIN: every accessible company, or just the one requested.
//  - HR: always their own single company; a mismatched explicit companyId errors.
//  - ADMIN: the requested company, or their first accessible one by default.
export function resolveTargetCompanies(
  user: any,
  requestedCompanyId: string | null,
  accessibleCompanies: AccessibleCompany[]
): { targetCompanyIds: string[]; resolvedCompanyId: string | null; error: string | null } {
  const accessibleCompanyIds = accessibleCompanies.map((c) => c.companyId)

  if (user.role === 'SUPER_ADMIN') {
    if (requestedCompanyId) {
      if (!accessibleCompanyIds.includes(requestedCompanyId)) {
        return { targetCompanyIds: [], resolvedCompanyId: null, error: 'Access denied to selected company' }
      }
      return { targetCompanyIds: [requestedCompanyId], resolvedCompanyId: requestedCompanyId, error: null }
    }
    return { targetCompanyIds: accessibleCompanyIds, resolvedCompanyId: null, error: null }
  }

  if (user.role === 'HR') {
    const hrCompanyId = accessibleCompanyIds[0]
    if (requestedCompanyId && requestedCompanyId !== hrCompanyId) {
      return { targetCompanyIds: [], resolvedCompanyId: null, error: 'HR can only access their assigned company' }
    }
    return { targetCompanyIds: [hrCompanyId], resolvedCompanyId: hrCompanyId, error: null }
  }

  if (requestedCompanyId) {
    if (!accessibleCompanyIds.includes(requestedCompanyId)) {
      return { targetCompanyIds: [], resolvedCompanyId: null, error: 'Access denied to selected company' }
    }
    return { targetCompanyIds: [requestedCompanyId], resolvedCompanyId: requestedCompanyId, error: null }
  }

  return { targetCompanyIds: [accessibleCompanyIds[0]], resolvedCompanyId: accessibleCompanyIds[0], error: null }
}
