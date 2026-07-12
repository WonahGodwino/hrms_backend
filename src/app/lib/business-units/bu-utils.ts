// Shared helpers for the Business Units module: company scoping (a concrete
// company is always required), staff-name formatting, and audit logging.
// BusinessUnit is a new model that still needs `prisma generate`, so all access
// goes through (prisma as any) — mirrors the designation/job pattern.
import { prisma } from '@/app/lib/db'
import { resolveScopedCompanyId } from '@/app/lib/company-scope'

export interface BUUser { role: string; userId?: string; companyId?: string | null }

// Resolve the company a Business Unit read/write is scoped to. Unlike some Core
// Setup reads, BU always needs a concrete company (like grade levels).
export async function resolveBUCompanyId(
  user: BUUser,
  requested?: string | null,
): Promise<{ companyId?: string; error?: { message: string; status: number } }> {
  const scope = await resolveScopedCompanyId(user, requested)
  if (scope.forbidden) return { error: { message: 'You do not have access to this company', status: 403 } }
  if (!scope.companyId) return { error: { message: 'Company ID is required', status: 400 } }
  return { companyId: scope.companyId }
}

// Resolve a Business Unit by id and verify the caller may access its company.
// Derives the company from the BU record itself, so id-scoped routes work even
// when the client doesn't pass a companyId (e.g. drill-down reads). Returns the
// company id on success.
export async function resolveBUAccessById(
  user: BUUser,
  id: string,
): Promise<{ companyId?: string; error?: { message: string; status: number } }> {
  const bu = await (prisma as any).businessUnit.findFirst({ where: { id }, select: { companyId: true } })
  if (!bu) return { error: { message: 'Business unit not found', status: 404 } }
  const scope = await resolveScopedCompanyId(user, bu.companyId)
  if (scope.forbidden || scope.companyId !== bu.companyId) {
    return { error: { message: 'You do not have access to this business unit', status: 403 } }
  }
  return { companyId: bu.companyId }
}

export function staffName(s?: { firstName?: string | null; lastName?: string | null } | null): string {
  if (!s) return ''
  return `${s.firstName || ''} ${s.lastName || ''}`.trim()
}

export function initialsOf(name?: string | null): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'U'
  return (parts[0][0] + (parts[parts.length - 1][0] || '')).toUpperCase()
}

// Record a Business Unit audit-trail entry. Best-effort — never throws.
export async function logBUAudit(
  companyId: string,
  businessUnitId: string,
  action: string,
  user: BUUser & { name?: string },
  details?: string,
): Promise<void> {
  try {
    await (prisma as any).businessUnitAuditLog.create({
      data: {
        businessUnitId,
        companyId,
        action,
        performedBy: user.userId || null,
        performedByName: user.name || null,
        details: details || null,
      },
    })
  } catch (e) {
    console.error('[BU_AUDIT] failed to write audit log (non-critical):', e)
  }
}
