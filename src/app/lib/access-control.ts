// /src/app/lib/access-control.ts
import { prisma } from '@/app/lib/db'

export interface UserContext {
  userId: string
  email: string
  role: string
}

/**
 * Verify if a user has access to a specific company
 * - SUPER_ADMIN: unrestricted access to all companies
 * - HR/ADMIN: must have entry in UserCompany table
 * - MANAGER/STAFF: only their own company via StaffRecord
 */
export async function verifyCompanyAccess(
  user: UserContext,
  companyId: string
): Promise<boolean> {
  // SUPER_ADMIN has unrestricted access
  if (user.role === 'SUPER_ADMIN') {
    return true
  }

  // HR/ADMIN: Check UserCompany table
  if (['HR', 'ADMIN'].includes(user.role)) {
    const userCompany = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId: user.userId,
          companyId: companyId
        }
      }
    })
    return !!userCompany
  }

  // MANAGER/STAFF: Get their staff record and check company
  if (['MANAGER', 'STAFF'].includes(user.role)) {
    const staffRecord = await prisma.staffRecord.findFirst({
      where: {
        email: user.email,
        isActive: true
      },
      select: { companyId: true }
    })
    return staffRecord?.companyId === companyId
  }

  return false
}

/**
 * Get all accessible company IDs for a user
 * - SUPER_ADMIN: all active companies
 * - HR/ADMIN: companies from UserCompany table
 * - MANAGER/STAFF: their own company only
 */
export async function getAccessibleCompanyIds(
  user: UserContext
): Promise<string[]> {
  // SUPER_ADMIN: All companies
  if (user.role === 'SUPER_ADMIN') {
    const companies = await prisma.company.findMany({
      where: { archived: 0 },
      select: { id: true }
    })
    return companies.map(c => c.id)
  }

  // HR/ADMIN: Companies from UserCompany table
  if (['HR', 'ADMIN'].includes(user.role)) {
    const userCompanies = await prisma.userCompany.findMany({
      where: {
        userId: user.userId,
        role: { in: ['HR', 'ADMIN'] }
      },
      select: { companyId: true }
    })
    return userCompanies.map(uc => uc.companyId)
  }

  // MANAGER/STAFF: Their own company
  if (['MANAGER', 'STAFF'].includes(user.role)) {
    const staffRecord = await prisma.staffRecord.findFirst({
      where: {
        email: user.email,
        isActive: true
      },
      select: { companyId: true }
    })
    return staffRecord?.companyId ? [staffRecord.companyId] : []
  }

  return []
}

/**
 * Get all accessible staff IDs for a user based on company access
 */
export async function getAccessibleStaffIds(
  user: UserContext
): Promise<string[]> {
  const companyIds = await getAccessibleCompanyIds(user)
  
  if (companyIds.length === 0) {
    return []
  }

  const staffRecords = await prisma.staffRecord.findMany({
    where: {
      companyId: { in: companyIds },
      isActive: true
    },
    select: { id: true }
  })

  return staffRecords.map(s => s.id)
}

/**
 * Verify if a user can access a specific staff record
 */
export async function verifyStaffRecordAccess(
  user: UserContext,
  staffRecordId: string
): Promise<boolean> {
  // SUPER_ADMIN: unrestricted
  if (user.role === 'SUPER_ADMIN') {
    return true
  }

  // HR/ADMIN: Check if staff is in accessible companies
  if (['HR', 'ADMIN'].includes(user.role)) {
    const accessibleStaffIds = await getAccessibleStaffIds(user)
    return accessibleStaffIds.includes(staffRecordId)
  }

  // MANAGER/STAFF: Only their own record
  if (['MANAGER', 'STAFF'].includes(user.role)) {
    const staffRecord = await prisma.staffRecord.findFirst({
      where: {
        email: user.email,
        isActive: true
      },
      select: { id: true }
    })
    return staffRecord?.id === staffRecordId
  }

  return false
}

/**
 * Get user's staff record ID from email
 */
export async function getStaffRecordIdFromEmail(email: string): Promise<string | null> {
  const staffRecord = await prisma.staffRecord.findFirst({
    where: { 
      email, 
      isActive: true 
    },
    select: { id: true }
  })
  return staffRecord?.id || null
}