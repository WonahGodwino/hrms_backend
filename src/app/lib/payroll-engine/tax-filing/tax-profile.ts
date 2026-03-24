// src/app/lib/payroll-engine/tax-filing/tax-profile.ts
// Employee Tax Profile Management

import { prisma } from '@/app/lib/db'
import { EmployeeTaxProfile, Prisma } from '@prisma/client'
import {
  EmployeeTaxProfileInput,
  EmployeeTaxProfileUpdate,
  EmployeeTaxProfileResponse,
  TaxProfileImportRow,
  TaxProfileImportResult,
  LockStatesResponse,
  NigeriaState,
} from './types'
import { validateJtbTin, stripTinFormatting } from './tin-validator'
import { validateStateName, normalizeStateName, getStateCode, getIRSName } from './states'

// ==================== SINGLE PROFILE OPERATIONS ====================

/**
 * Create a new employee tax profile
 * Supports lookup by either:
 *   - UUID (id field of StaffRecord)
 *   - Employee ID (staffId field like "EMP001")
 */
export async function createTaxProfile(
  companyId: string,
  input: EmployeeTaxProfileInput
): Promise<EmployeeTaxProfile> {
  // Validate staff exists and belongs to company
  // Try to find by UUID first, then by staffId (employee ID)
  let staff = await prisma.staffRecord.findFirst({
    where: {
      id: input.staffId,
      companyId,
      isActive: true,
    },
  })

  // If not found by UUID, try by employee staffId
  if (!staff) {
    staff = await prisma.staffRecord.findFirst({
      where: {
        staffId: input.staffId,
        companyId,
        isActive: true,
      },
    })
  }

  if (!staff) {
    throw new Error(`Staff member not found or does not belong to this company. Provide either staff record ID or employee ID.`)
  }

  // Use the actual UUID for the tax profile
  const staffRecordId = staff.id

  // Check if profile already exists
  const existing = await prisma.employeeTaxProfile.findUnique({
    where: { staffId: staffRecordId },
  })

  if (existing) {
    throw new Error(`Tax profile already exists for this staff member`)
  }

  // Validate state of residence
  const normalizedState = normalizeStateName(input.stateOfResidence)
  if (!normalizedState) {
    throw new Error(`Invalid state of residence: ${input.stateOfResidence}`)
  }

  // Validate TIN if provided
  if (input.jtbTin) {
    const tinResult = validateJtbTin(input.jtbTin)
    if (!tinResult.valid) {
      throw new Error(`Invalid JTB TIN: ${tinResult.error}`)
    }
  }

  // Create the profile
  return prisma.employeeTaxProfile.create({
    data: {
      staffId: staffRecordId,
      companyId,
      stateOfResidence: normalizedState,
      jtbTin: input.jtbTin ? stripTinFormatting(input.jtbTin) : null,
      pfaName: input.pfaName || null,
    },
  })
}

/**
 * Get tax profile by staff ID
 */
export async function getTaxProfile(
  staffId: string,
  companyId: string
): Promise<EmployeeTaxProfileResponse | null> {
  const profile = await prisma.employeeTaxProfile.findFirst({
    where: {
      staffId,
      companyId,
    },
    include: {
      staff: {
        select: {
          id: true,
          staffId: true,
          firstName: true,
          lastName: true,
          email: true,
          department: true,
          position: true,
        },
      },
    },
  })

  return profile as EmployeeTaxProfileResponse | null
}

/**
 * Update tax profile
 */
export async function updateTaxProfile(
  staffId: string,
  companyId: string,
  update: EmployeeTaxProfileUpdate
): Promise<EmployeeTaxProfile> {
  // Get existing profile
  const existing = await prisma.employeeTaxProfile.findFirst({
    where: {
      staffId,
      companyId,
    },
  })

  if (!existing) {
    throw new Error(`Tax profile not found for staff ${staffId}`)
  }

  const updateData: Prisma.EmployeeTaxProfileUpdateInput = {}

  // Validate and update state of residence
  if (update.stateOfResidence !== undefined) {
    // Check if state is locked
    if (existing.lockedState && existing.lockedDate) {
      throw new Error(
        `Cannot change state of residence. State was locked on ${existing.lockedDate.toISOString().split('T')[0]} per PITA rules.`
      )
    }

    const normalizedState = normalizeStateName(update.stateOfResidence)
    if (!normalizedState) {
      throw new Error(`Invalid state of residence: ${update.stateOfResidence}`)
    }
    updateData.stateOfResidence = normalizedState
  }

  // Validate and update TIN
  if (update.jtbTin !== undefined) {
    if (update.jtbTin) {
      const tinResult = validateJtbTin(update.jtbTin)
      if (!tinResult.valid) {
        throw new Error(`Invalid JTB TIN: ${tinResult.error}`)
      }
      updateData.jtbTin = stripTinFormatting(update.jtbTin)
    } else {
      updateData.jtbTin = null
    }
  }

  if (update.pfaName !== undefined) {
    updateData.pfaName = update.pfaName || null
  }

  if (update.tinVerified !== undefined) {
    updateData.tinVerified = update.tinVerified
  }

  return prisma.employeeTaxProfile.update({
    where: { id: existing.id },
    data: updateData,
  })
}

/**
 * Delete tax profile
 */
export async function deleteTaxProfile(
  staffId: string,
  companyId: string
): Promise<void> {
  const profile = await prisma.employeeTaxProfile.findFirst({
    where: {
      staffId,
      companyId,
    },
  })

  if (!profile) {
    throw new Error(`Tax profile not found for staff ${staffId}`)
  }

  await prisma.employeeTaxProfile.delete({
    where: { id: profile.id },
  })
}

// ==================== LIST & QUERY OPERATIONS ====================

/**
 * List all tax profiles for a company
 */
export async function listTaxProfiles(
  companyId: string,
  options?: {
    stateOfResidence?: string
    hasJtbTin?: boolean
    page?: number
    limit?: number
  }
): Promise<{ profiles: EmployeeTaxProfileResponse[]; total: number }> {
  const { stateOfResidence, hasJtbTin, page = 1, limit = 50 } = options || {}

  const where: Prisma.EmployeeTaxProfileWhereInput = {
    companyId,
  }

  if (stateOfResidence) {
    const normalized = normalizeStateName(stateOfResidence)
    if (normalized) {
      where.stateOfResidence = normalized
    }
  }

  if (hasJtbTin !== undefined) {
    where.jtbTin = hasJtbTin ? { not: null } : null
  }

  const [profiles, total] = await Promise.all([
    prisma.employeeTaxProfile.findMany({
      where,
      include: {
        staff: {
          select: {
            id: true,
            staffId: true,
            firstName: true,
            lastName: true,
            email: true,
            department: true,
            position: true,
          },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.employeeTaxProfile.count({ where }),
  ])

  return {
    profiles: profiles as EmployeeTaxProfileResponse[],
    total,
  }
}

/**
 * Get employees without tax profiles
 */
export async function getEmployeesWithoutTaxProfile(
  companyId: string
): Promise<{ id: string; staffId: string; firstName: string; lastName: string; email: string }[]> {
  const employees = await prisma.staffRecord.findMany({
    where: {
      companyId,
      isActive: true,
      taxProfile: null,
    },
    select: {
      id: true,
      staffId: true,
      firstName: true,
      lastName: true,
      email: true,
    },
    orderBy: { firstName: 'asc' },
  })

  return employees
}

/**
 * Get employee count by state for a company
 */
export async function getEmployeeCountByState(
  companyId: string
): Promise<{ state: string; stateCode: string; irsName: string; count: number }[]> {
  const profiles = await prisma.employeeTaxProfile.groupBy({
    by: ['stateOfResidence'],
    where: { companyId },
    _count: { stateOfResidence: true },
  })

  return profiles.map(p => ({
    state: p.stateOfResidence,
    stateCode: getStateCode(p.stateOfResidence) || '',
    irsName: getIRSName(p.stateOfResidence) || '',
    count: p._count.stateOfResidence,
  })).sort((a, b) => b.count - a.count)
}

// ==================== BULK IMPORT ====================

/**
 * Import tax profiles from bulk data
 */
export async function importTaxProfiles(
  companyId: string,
  uploadedBy: string,
  rows: TaxProfileImportRow[],
  fileName: string,
  filePath: string
): Promise<TaxProfileImportResult> {
  const errors: string[] = []
  let successful = 0
  let failed = 0

  // Get all staff for this company
  const staffRecords = await prisma.staffRecord.findMany({
    where: {
      companyId,
      isActive: true,
    },
    select: {
      id: true,
      staffId: true,
    },
  })

  const staffMap = new Map(staffRecords.map(s => [s.staffId.toLowerCase(), s.id]))

  // Process each row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2 // Account for header row

    try {
      // Validate staff ID
      if (!row.staffId) {
        errors.push(`Row ${rowNum}: Staff ID is required`)
        failed++
        continue
      }

      const staffRecordId = staffMap.get(row.staffId.toLowerCase())
      if (!staffRecordId) {
        errors.push(`Row ${rowNum}: Staff ID "${row.staffId}" not found`)
        failed++
        continue
      }

      // Validate state
      if (!row.stateOfResidence) {
        errors.push(`Row ${rowNum}: State of residence is required`)
        failed++
        continue
      }

      const normalizedState = normalizeStateName(row.stateOfResidence)
      if (!normalizedState) {
        errors.push(`Row ${rowNum}: Invalid state "${row.stateOfResidence}"`)
        failed++
        continue
      }

      // Validate TIN if provided
      if (row.jtbTin) {
        const tinResult = validateJtbTin(row.jtbTin)
        if (!tinResult.valid) {
          errors.push(`Row ${rowNum}: ${tinResult.error}`)
          failed++
          continue
        }
      }

      // Upsert the profile
      await prisma.employeeTaxProfile.upsert({
        where: { staffId: staffRecordId },
        create: {
          staffId: staffRecordId,
          companyId,
          stateOfResidence: normalizedState,
          jtbTin: row.jtbTin ? stripTinFormatting(row.jtbTin) : null,
          pfaName: row.pfaName || null,
        },
        update: {
          stateOfResidence: normalizedState,
          jtbTin: row.jtbTin ? stripTinFormatting(row.jtbTin) : null,
          pfaName: row.pfaName || null,
        },
      })

      successful++
    } catch (error: any) {
      errors.push(`Row ${rowNum}: ${error.message || 'Unknown error'}`)
      failed++
    }
  }

  // Create upload record
  const upload = await prisma.taxProfileUpload.create({
    data: {
      companyId,
      fileName,
      filePath,
      totalRecords: rows.length,
      successful,
      failed,
      errors,
      uploadedBy,
    },
  })

  return {
    uploadId: upload.id,
    totalRecords: rows.length,
    successful,
    failed,
    errors,
    failedRecordsPath: null,
  }
}

// ==================== STATE LOCKING ====================

/**
 * Lock states for a year (Jan 1st rule per PITA)
 * This should be run on January 1st of each year
 */
export async function lockStatesForYear(
  companyId: string,
  year: number
): Promise<LockStatesResponse> {
  const lockDate = new Date(year, 0, 1) // January 1st of the year

  // Get all profiles that don't have a locked state yet
  const profilesToLock = await prisma.employeeTaxProfile.findMany({
    where: {
      companyId,
      lockedState: null,
    },
  })

  // Get already locked profiles
  const alreadyLocked = await prisma.employeeTaxProfile.count({
    where: {
      companyId,
      lockedState: { not: null },
    },
  })

  let locked = 0
  let skipped = 0
  const errors: string[] = []

  for (const profile of profilesToLock) {
    try {
      await prisma.employeeTaxProfile.update({
        where: { id: profile.id },
        data: {
          lockedState: profile.stateOfResidence,
          lockedDate: lockDate,
        },
      })
      locked++
    } catch (error: any) {
      errors.push(`Failed to lock state for profile ${profile.id}: ${error.message}`)
      skipped++
    }
  }

  return {
    locked,
    skipped,
    alreadyLocked,
    errors,
  }
}

/**
 * Check if states are locked for a company
 */
export async function areStatesLocked(companyId: string): Promise<boolean> {
  const lockedCount = await prisma.employeeTaxProfile.count({
    where: {
      companyId,
      lockedState: { not: null },
    },
  })

  return lockedCount > 0
}

/**
 * Get the effective state for tax filing
 * Returns locked state if available, otherwise current state
 */
export function getEffectiveState(profile: EmployeeTaxProfile): string {
  return profile.lockedState || profile.stateOfResidence
}