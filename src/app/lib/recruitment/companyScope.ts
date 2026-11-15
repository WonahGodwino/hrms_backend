// Resolves the effective company scope for recruitment reads, honouring the
// caller's global company selection (sent as a `companyId` query param) while
// enforcing per-role access:
//   - HR:          always locked to their own company (param ignored).
//   - ADMIN:       may target any company they are assigned to (ADMIN/ALL).
//   - SUPER_ADMIN: may target any non-archived company.
// When no param is supplied it falls back to the user's token company.
import { prisma } from '@/app/lib/db'

export interface CompanyScopeResult {
  companyId?: string
  error?: { message: string; status: number }
}

export async function resolveRecruitmentCompanyId(
  user: { role: string; userId?: string; companyId?: string | null },
  requestedCompanyId?: string | null
): Promise<CompanyScopeResult> {
  const requested = requestedCompanyId?.trim() || null

  if (user.role === 'HR') {
    if (!user.companyId) {
      return { error: { message: 'Company context missing for this user', status: 400 } }
    }
    // HR is always scoped to their own company regardless of any param.
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

/**
 * Checks whether an authenticated user (SUPER_ADMIN, ADMIN, HR) has permission
 * to access or modify a job.
 * - SUPER_ADMIN: has access to all non-archived jobs across all companies.
 * - Creator: if user.userId matches the job's createdBy, access is granted.
 * - Direct token company: if user.companyId matches the job's companyId, access is granted.
 * - Token companyIds list: if user.companyIds includes the job's companyId, access is granted.
 * - Primary StaffRecord: if user's StaffRecord in DB belongs to targetCompanyId with HR/ADMIN/SUPER_ADMIN role, access is granted.
 * - UserCompany: if user is assigned to targetCompanyId in UserCompany with HR/ADMIN/ALL role, access is granted.
 */
export async function checkJobPermission(
  user: { role?: string; userId?: string; companyId?: string | null; companyIds?: string[] } | null | undefined,
  targetCompanyId: string,
  createdById?: string | null
): Promise<boolean> {
  if (!user) return false

  // 1. SUPER_ADMIN has platform-wide access
  if (user.role === 'SUPER_ADMIN') return true

  // 2. Creator of the job always has access to view/manage it
  if (user.userId && createdById && user.userId === createdById) {
    return true
  }

  // 3. User's active token company matches target company
  if (user.companyId && user.companyId === targetCompanyId) {
    return true
  }

  // 4. Token companyIds array includes target company
  if (Array.isArray(user.companyIds) && user.companyIds.includes(targetCompanyId)) {
    return true
  }

  // 5. Check primary StaffRecord company and role in the database
  if (user.userId) {
    const staff = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { companyId: true, role: true, isActive: true },
    })
    if (
      staff &&
      staff.isActive &&
      staff.companyId === targetCompanyId &&
      ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(staff.role)
    ) {
      return true
    }
  }

  // 6. Check multi-company assignments in UserCompany (for both ADMIN and HR)
  if (user.userId) {
    const userCompany = await prisma.userCompany.findFirst({
      where: {
        userId: user.userId,
        companyId: targetCompanyId,
        role: { in: ['ADMIN', 'HR', 'ALL'] },
      },
      select: { id: true },
    })
    if (userCompany) return true
  }

  return false
}

