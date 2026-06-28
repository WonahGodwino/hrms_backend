import { prisma } from '@/app/lib/db'
import type { AuthUser } from '@/app/lib/auth'

/**
 * Extracts bearer token from authorization header
 * @param authHeader - The authorization header value
 * @returns The extracted token or null if invalid
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) {
    return null
  }
  if (!authHeader.startsWith('Bearer ')) {
    console.warn('[extractBearerToken] Invalid authorization header format')
    return null
  }
  return authHeader.replace('Bearer ', '').trim()
}

/**
 * Resolves company IDs based on user role and access level
 * @param user - The authenticated user
 * @returns Array of company IDs the user has access to
 */
export async function resolveScopedCompanyIds(user: AuthUser): Promise<string[]> {
  try {
    if (user.role === 'SUPER_ADMIN') {
      const companies = await prisma.company.findMany({
        where: { archived: 0 },
        select: { id: true },
      })
      return companies.map((company) => company.id)
    }

    if (user.role === 'ADMIN' || user.role === 'HR') {
      const assignments = await prisma.userCompany.findMany({
        where: {
          userId: user.userId,
          company: { archived: 0 },
        },
        select: { companyId: true },
      })
      return assignments.map((assignment) => assignment.companyId)
    }

    // STAFF (and any other personal-scope role): resolve their own company.
    // Prefer the exact staff record the token was issued for
    // (user.userId === StaffRecord.id) so the scope stays correct even if the
    // same email exists in multiple companies — independent of login policy.
    if (user.userId) {
      const ownRecord = await prisma.staffRecord.findUnique({
        where: { id: user.userId },
        select: { companyId: true, isActive: true },
      })
      if (ownRecord?.isActive) {
        return [ownRecord.companyId]
      }
    }

    // Fallback for legacy tokens that don't carry a staff-record userId.
    const staffRecord = await prisma.staffRecord.findFirst({
      where: { email: user.email, isActive: true },
      select: { companyId: true },
    })

    return staffRecord?.companyId ? [staffRecord.companyId] : []
  } catch (error) {
    console.error('[resolveScopedCompanyIds] Error resolving company access:', error)
    throw new Error('Failed to resolve company access')
  }
}

/**
 * Finds a staff member by email address scoped to a specific company.
 * Used when an ADMIN/SUPER_ADMIN is operating in a selected company that
 * differs from their home company.
 */
export async function findStaffByEmailAndCompany(email: string, companyId: string) {
  try {
    return await prisma.staffRecord.findFirst({
      where: {
        email: email.toLowerCase().trim(),
        companyId,
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        companyId: true,
        role: true,
      },
    })
  } catch (error) {
    console.error('[findStaffByEmailAndCompany] Error finding staff:', error)
    throw new Error('Failed to find staff record')
  }
}

/**
 * Finds a staff member by email address
 * @param email - The staff email
 * @returns Staff record or null if not found
 */
export async function findStaffByEmail(email: string) {
  try {
    return await prisma.staffRecord.findFirst({
      where: {
        email: email.toLowerCase().trim(),
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        companyId: true,
        role: true,
      },
    })
  } catch (error) {
    console.error('[findStaffByEmail] Error finding staff:', error)
    throw new Error('Failed to find staff record')
  }
}

/**
 * Finds a staff member by ID
 * @param staffId - The staff ID
 * @returns Staff record or null if not found
 */
export async function findStaffById(staffId: string) {
  try {
    return await prisma.staffRecord.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        companyId: true,
        role: true,
        isActive: true,
      },
    })
  } catch (error) {
    console.error('[findStaffById] Error finding staff:', error)
    throw new Error('Failed to find staff record')
  }
}

