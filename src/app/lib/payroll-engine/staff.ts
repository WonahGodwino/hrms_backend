/**
 * Staff Service for Payroll Engine
 * Manages staff records for payroll processing
 */

import { prisma } from '@/app/lib/db'
import {
  CreateStaffDto,
  UpdateStaffDto,
  QueryStaffDto,
  StaffWithSalaryStatus,
} from './types'

/**
 * Create a new staff record
 */
export async function createStaff(
  dto: CreateStaffDto,
  companyId: string,
  userId: string
) {
  // Check if staffId already exists in company
  const existingByStaffId = await prisma.staffRecord.findUnique({
    where: {
      staffId_companyId: {
        staffId: dto.staffId,
        companyId,
      },
    },
  })

  if (existingByStaffId) {
    throw new Error(`Staff ID "${dto.staffId}" already exists in this company`)
  }

  // Check if email already exists in company
  const existingByEmail = await prisma.staffRecord.findUnique({
    where: {
      email_companyId: {
        email: dto.email.toLowerCase().trim(),
        companyId,
      },
    },
  })

  if (existingByEmail) {
    throw new Error(`Email "${dto.email}" already exists in this company`)
  }

  return prisma.staffRecord.create({
    data: {
      staffId: dto.staffId,
      email: dto.email.toLowerCase().trim(),
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      department: dto.department.trim(),
      position: dto.position.trim(),
      phone: dto.phone?.trim() || null,
      bankName: dto.bankName?.trim() || null,
      accountNumber: dto.accountNumber?.trim() || null,
      bvn: dto.bvn?.trim() || null,
      companyId,
      createdBy: userId,
      isActive: true,
      isRegistered: false,
      role: 'STAFF',
    },
  })
}

/**
 * Get staff list with salary structure status
 */
export async function getStaffList(
  companyId: string,
  query: QueryStaffDto
): Promise<{ data: StaffWithSalaryStatus[]; total: number; page: number; limit: number }> {
  const { page = 1, limit = 20, search, department, includeInactive = false } = query

  const where: any = { companyId }

  if (!includeInactive) {
    where.isActive = true
  }

  if (department) {
    where.department = { contains: department, mode: 'insensitive' }
  }

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { staffId: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [staffRecords, total] = await Promise.all([
    prisma.staffRecord.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        employeeSalaries: {
          where: { isActive: true },
          select: { id: true },
          take: 1,
        },
      },
    }),
    prisma.staffRecord.count({ where }),
  ])

  const data: StaffWithSalaryStatus[] = staffRecords.map((staff) => ({
    id: staff.id,
    staffId: staff.staffId,
    email: staff.email,
    firstName: staff.firstName,
    lastName: staff.lastName,
    fullName: `${staff.firstName} ${staff.lastName}`,
    department: staff.department,
    position: staff.position,
    phone: staff.phone,
    isActive: staff.isActive,
    hasSalaryStructure: staff.employeeSalaries.length > 0,
    createdAt: staff.createdAt,
  }))

  return { data, total, page, limit }
}

/**
 * Get a single staff by ID
 */
export async function getStaffById(id: string, companyId: string) {
  const staff = await prisma.staffRecord.findFirst({
    where: { id, companyId },
    include: {
      employeeSalaries: {
        where: { isActive: true },
        select: { id: true },
        take: 1,
      },
    },
  })

  if (!staff) {
    throw new Error(`Staff with ID "${id}" not found`)
  }

  return {
    id: staff.id,
    staffId: staff.staffId,
    email: staff.email,
    firstName: staff.firstName,
    lastName: staff.lastName,
    fullName: `${staff.firstName} ${staff.lastName}`,
    department: staff.department,
    position: staff.position,
    phone: staff.phone,
    bankName: staff.bankName,
    accountNumber: staff.accountNumber,
    bvn: staff.bvn,
    isActive: staff.isActive,
    hasSalaryStructure: staff.employeeSalaries.length > 0,
    createdAt: staff.createdAt,
  }
}

/**
 * Update a staff record
 */
export async function updateStaff(
  id: string,
  dto: UpdateStaffDto,
  companyId: string,
  userId: string
) {
  const staff = await prisma.staffRecord.findFirst({
    where: { id, companyId },
  })

  if (!staff) {
    throw new Error(`Staff with ID "${id}" not found`)
  }

  // Check email uniqueness if being updated
  if (dto.email && dto.email.toLowerCase().trim() !== staff.email) {
    const existingByEmail = await prisma.staffRecord.findUnique({
      where: {
        email_companyId: {
          email: dto.email.toLowerCase().trim(),
          companyId,
        },
      },
    })

    if (existingByEmail) {
      throw new Error(`Email "${dto.email}" already exists in this company`)
    }
  }

  const updateData: any = { updatedBy: userId }

  if (dto.email !== undefined) updateData.email = dto.email.toLowerCase().trim()
  if (dto.firstName !== undefined) updateData.firstName = dto.firstName.trim()
  if (dto.lastName !== undefined) updateData.lastName = dto.lastName.trim()
  if (dto.department !== undefined) updateData.department = dto.department.trim()
  if (dto.position !== undefined) updateData.position = dto.position.trim()
  if (dto.phone !== undefined) updateData.phone = dto.phone?.trim() || null
  if (dto.bankName !== undefined) updateData.bankName = dto.bankName?.trim() || null
  if (dto.accountNumber !== undefined) updateData.accountNumber = dto.accountNumber?.trim() || null
  if (dto.bvn !== undefined) updateData.bvn = dto.bvn?.trim() || null

  return prisma.staffRecord.update({
    where: { id },
    data: updateData,
  })
}

/**
 * Deactivate a staff record (soft delete)
 */
export async function deactivateStaff(id: string, companyId: string) {
  const staff = await prisma.staffRecord.findFirst({
    where: { id, companyId },
  })

  if (!staff) {
    throw new Error(`Staff with ID "${id}" not found`)
  }

  return prisma.staffRecord.update({
    where: { id },
    data: { isActive: false },
  })
}

/**
 * Get staff without salary structure (for bulk setup)
 */
export async function getStaffWithoutSalary(companyId: string) {
  const staffRecords = await prisma.staffRecord.findMany({
    where: {
      companyId,
      isActive: true,
      employeeSalaries: {
        none: { isActive: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      staffId: true,
      email: true,
      firstName: true,
      lastName: true,
      department: true,
      position: true,
    },
  })

  return staffRecords.map((staff) => ({
    ...staff,
    fullName: `${staff.firstName} ${staff.lastName}`,
  }))
}
