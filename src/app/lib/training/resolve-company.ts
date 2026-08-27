// Company scoping for Training-domain endpoints, mirroring the pattern used by
// GET /api/staff/records: the caller must explicitly select a company via a
// `companyId` param (query string or body) rather than the endpoint silently
// falling back to whatever company happens to be on the caller's JWT.
//
//  - No companyId supplied:
//      SUPER_ADMIN with a company on their token → falls back to that.
//      Everyone else (including a SUPER_ADMIN with none) → 400, must select one.
//  - companyId supplied:
//      SUPER_ADMIN → any non-archived company.
//      Everyone else → must either be assigned to it via UserCompany, or it
//      must match their own token company; otherwise 403.
import { prisma } from '@/app/lib/db'

export interface ResolvedCompany {
  companyId: string
}

export interface CompanyResolutionError {
  error: { message: string; status: number }
}

export async function resolveRequestCompanyId(
  user: { role: string; userId: string; companyId?: string },
  requestedCompanyId?: string | null,
): Promise<ResolvedCompany | CompanyResolutionError> {
  const requested = requestedCompanyId?.trim() || null

  if (!requested) {
    if (user.role === 'SUPER_ADMIN' && user.companyId) {
      return { companyId: user.companyId }
    }
    return { error: { message: 'Company ID is required. Please select a company.', status: 400 } }
  }

  if (user.role === 'SUPER_ADMIN') {
    const exists = await prisma.company.findFirst({ where: { id: requested, archived: 0 }, select: { id: true } })
    if (!exists) return { error: { message: 'Company not found', status: 404 } }
    return { companyId: requested }
  }

  if (requested === user.companyId) {
    return { companyId: requested }
  }

  const hasAccess = await prisma.userCompany.findFirst({
    where: { userId: user.userId, companyId: requested },
    select: { id: true },
  })
  if (!hasAccess) {
    return { error: { message: 'You do not have access to this company', status: 403 } }
  }
  return { companyId: requested }
}

export function isCompanyError(r: ResolvedCompany | CompanyResolutionError): r is CompanyResolutionError {
  return (r as CompanyResolutionError).error !== undefined
}
