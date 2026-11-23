// Tenant check for routes that load a record by id (SEC-005).
//
// A record that belongs to a company the caller cannot access must look the
// same as a missing record, so callers respond 404 when this returns false.
import { checkCompanyAccess, type AuthUser } from '@/app/lib/auth'

export async function canAccessCompany(
  user: Pick<AuthUser, 'userId' | 'role' | 'companyId'>,
  companyId: string | null | undefined,
): Promise<boolean> {
  if (!companyId) return false
  if (user.role === 'SUPER_ADMIN') return true
  if (user.companyId === companyId) return true
  return checkCompanyAccess(user.userId, companyId, user.role)
}
