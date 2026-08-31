// src/app/lib/departments/department-utils.ts
import { prisma } from '@/app/lib/db'
import { StaffRecord } from '@prisma/client'

export interface PositionCapacity {
  position: string
  currentFill: number
  maxFill: number | null
  isUnlimited: boolean
  status: 'healthy' | 'capacity' | 'overstaffed'
}

export interface AuthUser {
  userId: string
  email?: string
  role: string
  companyId?: string
}

/**
 * Get user display name from user object
 * @param user - The authenticated user object from requireRole
 * @returns Formatted user name (firstName lastName) or email/userId as fallback
 */
export async function getUserDisplayName(user: AuthUser): Promise<string> {
  try {
    const userRecord = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { firstName: true, lastName: true, email: true }
    })
    
    if (userRecord?.firstName || userRecord?.lastName) {
      const firstName = userRecord.firstName || ''
      const lastName = userRecord.lastName || ''
      const fullName = `${firstName} ${lastName}`.trim()
      if (fullName) return fullName
    }
    
    return user.email || user.userId
  } catch (error) {
    console.error('Error fetching user display name:', error)
    return user.email || user.userId
  }
}

/**
 * Get user display name synchronously (if you already have the user record)
 * @param userRecord - The StaffRecord object
 * @returns Formatted user name or email
 */
export function getUserDisplayNameFromRecord(userRecord: { firstName?: string | null; lastName?: string | null; email?: string } | null): string {
  if (!userRecord) return 'System'
  
  const firstName = userRecord.firstName || ''
  const lastName = userRecord.lastName || ''
  const fullName = `${firstName} ${lastName}`.trim()
  
  if (fullName) return fullName
  return userRecord.email || 'Unknown User'
}

export async function validateCompanyAccess(user: AuthUser, companyId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true
  
  const userCompany = await prisma.userCompany.findFirst({
    where: {
      userId: user.userId,
      companyId: companyId,
      role: { in: [user.role, 'ALL'] }
    }
  })
  
  return !!userCompany
}

export async function getDepartmentWithAccess(user: AuthUser, departmentId: string) {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    include: { company: { select: { id: true, companyName: true } } }
  })
  
  if (!department) throw new Error('Department not found')
  
  const hasAccess = await validateCompanyAccess(user, department.companyId)
  if (!hasAccess && user.role !== 'SUPER_ADMIN') {
    throw new Error('Forbidden: No access to this company')
  }
  
  return department
}

export async function getDepartmentPositionCapacity(departmentId: string): Promise<PositionCapacity[]> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { positionCapacity: true }
  })
  
  if (!department) throw new Error('Department not found')
  
  const positionCapacityConfig = (department.positionCapacity as Record<string, number | null>) || {}
  
  const staffByPosition = await prisma.staffRecord.groupBy({
    by: ['position'],
    where: {
      departmentId,
      isActive: true
    },
    _count: { id: true }
  })
  
  const currentCountMap = new Map<string, number>()
  staffByPosition.forEach(item => {
    if (item.position) {
      currentCountMap.set(item.position, item._count.id)
    }
  })
  
  const allPositions = new Set([
    ...Object.keys(positionCapacityConfig),
    ...Array.from(currentCountMap.keys())
  ])
  
  const capacities: PositionCapacity[] = []
  
  for (const position of allPositions) {
    const maxFill = positionCapacityConfig[position]
    const currentFill = currentCountMap.get(position) || 0
    
    let status: 'healthy' | 'capacity' | 'overstaffed' = 'healthy'
    if (maxFill !== null && maxFill !== undefined && maxFill > 0) {
      const fillPercentage = (currentFill / maxFill) * 100
      if (fillPercentage >= 100) status = 'overstaffed'
      else if (fillPercentage >= 85) status = 'capacity'
      else status = 'healthy'
    }
    
    capacities.push({
      position,
      currentFill,
      maxFill: maxFill ?? null,
      isUnlimited: maxFill === null || maxFill === 0,
      status
    })
  }
  
  return capacities.sort((a, b) => a.position.localeCompare(b.position))
}

export async function logDepartmentAction(
  departmentId: string,
  companyId: string,
  action: string,
  userId: string,
  userName: string,
  type: string,
  details?: any
) {
  return prisma.departmentAuditLog.create({
    data: {
      departmentId,
      companyId,
      action,
      userId,
      userName,
      type,
      details: details || {},
      timestamp: new Date()
    }
  })
}

export async function logStaffDepartmentChange(
  staffId: string,
  oldDepartmentId: string | null,
  newDepartmentId: string | null,
  oldPosition: string | null,
  newPosition: string | null,
  performedBy: string,
  reason?: string
) {
  const staff = await prisma.staffRecord.findUnique({
    where: { id: staffId },
    select: { companyId: true }
  })
  
  if (!staff) throw new Error('Staff not found')
  
  let action = 'JOINED'
  if (oldDepartmentId && newDepartmentId) action = 'TRANSFERRED'
  else if (oldDepartmentId && !newDepartmentId) action = 'REMOVED'
  else if (!oldDepartmentId && newDepartmentId) action = 'JOINED'
  
  return prisma.departmentStaffHistory.create({
    data: {
      staffId,
      departmentId: newDepartmentId || oldDepartmentId!,
      companyId: staff.companyId,
      action,
      fromDepartmentId: oldDepartmentId,
      toDepartmentId: newDepartmentId,
      oldPosition,
      newPosition,
      reason,
      performedBy,
      effectiveDate: new Date()
    }
  })
}

/**
 * Update department active headcount based on staff records
 * @param departmentId - The department ID to update
 */
export async function updateDepartmentHeadcount(departmentId: string): Promise<void> {
  const activeCount = await prisma.staffRecord.count({
    where: {
      departmentId,
      isActive: true
    }
  })
  
  await prisma.department.update({
    where: { id: departmentId },
    data: { activeHeadcount: activeCount }
  })
}

/**
 * Transfer all staff from one department to another
 * @param fromDepartmentId - Source department
 * @param toDepartmentId - Target department
 * @param performedBy - User ID performing the transfer
 * @returns Number of staff transferred
 */
export async function transferAllStaff(
  fromDepartmentId: string,
  toDepartmentId: string,
  performedBy: string
): Promise<number> {
  const staffToTransfer = await prisma.staffRecord.findMany({
    where: { departmentId: fromDepartmentId, isActive: true },
    select: { id: true, position: true }
  })
  
  for (const staff of staffToTransfer) {
    await prisma.staffRecord.update({
      where: { id: staff.id },
      data: { departmentId: toDepartmentId }
    })
    
    await logStaffDepartmentChange(
      staff.id,
      fromDepartmentId,
      toDepartmentId,
      staff.position,
      staff.position,
      performedBy,
      'Bulk transfer'
    )
  }
  
  // Update headcounts for both departments
  await updateDepartmentHeadcount(fromDepartmentId)
  await updateDepartmentHeadcount(toDepartmentId)
  
  return staffToTransfer.length
}

/**
 * Check if a department has any active staff
 * @param departmentId - Department ID to check
 * @returns Boolean indicating if department has active staff
 */
export async function departmentHasActiveStaff(departmentId: string): Promise<boolean> {
  const count = await prisma.staffRecord.count({
    where: {
      departmentId,
      isActive: true
    }
  })
  return count > 0
}

/**
 * Validate that a department exists and is active
 * @param departmentId - Department ID to validate
 * @param companyId - Company ID for scope
 * @returns The department if found and active
 */
export async function validateActiveDepartment(departmentId: string, companyId: string) {
  const department = await prisma.department.findFirst({
    where: {
      id: departmentId,
      companyId,
      status: 'Active'
    }
  })
  
  if (!department) {
    throw new Error('Department not found or inactive')
  }
  
  return department
}