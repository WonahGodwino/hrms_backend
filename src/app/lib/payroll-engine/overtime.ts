/**
 * Overtime Service
 * Manages overtime entries for payroll computation
 */

import { prisma } from '@/app/lib/db'
import { Prisma } from '@prisma/client'
import { CreateOvertimeEntryDto, QueryOvertimeEntryDto } from './types'

/**
 * Create a single overtime entry
 */
export async function createOvertimeEntry(
  dto: CreateOvertimeEntryDto,
  companyId: string
) {
  return prisma.overtimeEntry.create({
    data: {
      payPeriodId: dto.payPeriodId,
      staffId: dto.staffId,
      companyId,
      overtimeHours: dto.overtimeHours,
      multiplier: dto.multiplier || 1.5,
      date: dto.date ? new Date(dto.date) : undefined,
      description: dto.description,
    },
  })
}

/**
 * Get overtime entries by period
 */
export async function getOvertimeByPeriod(
  payPeriodId: string,
  companyId: string,
  query: QueryOvertimeEntryDto
) {
  const { page = 1, limit = 10, staffId } = query

  const where: any = { payPeriodId, companyId }
  if (staffId) where.staffId = staffId

  const [data, total] = await Promise.all([
    prisma.overtimeEntry.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        staff: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.overtimeEntry.count({ where }),
  ])

  return { data, total, page, limit }
}

/**
 * Get total overtime for a staff member in a period
 */
export async function getStaffOvertimeTotal(
  payPeriodId: string,
  staffId: string
) {
  const entries = await prisma.overtimeEntry.findMany({
    where: { payPeriodId, staffId },
  })

  const totalHours = entries.reduce(
    (sum, entry) => sum + Number(entry.overtimeHours),
    0
  )

  return { totalHours, entries }
}

/**
 * Get overtime entries for payroll computation
 */
export async function getOvertimeForComputation(
  payPeriodId: string,
  staffId: string
): Promise<{ hours: number; multiplier: number }[]> {
  const entries = await prisma.overtimeEntry.findMany({
    where: { payPeriodId, staffId },
  })

  return entries.map((entry) => ({
    hours: Number(entry.overtimeHours),
    multiplier: Number(entry.multiplier),
  }))
}

/**
 * Delete an overtime entry
 */
export async function deleteOvertimeEntry(id: string): Promise<void> {
  const result = await prisma.overtimeEntry.delete({
    where: { id },
  }).catch(() => null)

  if (!result) {
    throw new Error(`Overtime entry ${id} not found`)
  }
}

/**
 * Bulk import overtime entries from CSV
 */
export async function bulkImportOvertime(
  payPeriodId: string,
  data: {
    staffId: string
    overtimeHours: number
    multiplier?: number
    description?: string
  }[],
  companyId: string,
  sourceFileId?: string
) {
  const results = { created: 0, errors: [] as string[] }

  for (const row of data) {
    try {
      await prisma.overtimeEntry.create({
        data: {
          payPeriodId,
          staffId: row.staffId,
          companyId,
          overtimeHours: row.overtimeHours,
          multiplier: row.multiplier || 1.5,
          description: row.description,
          sourceFileId,
        },
      })
      results.created++
    } catch (error: any) {
      results.errors.push(`Staff ${row.staffId}: ${error.message}`)
    }
  }

  return results
}

/**
 * Delete all overtime entries from a source file
 */
export async function deleteBySourceFile(sourceFileId: string): Promise<number> {
  const result = await prisma.overtimeEntry.deleteMany({
    where: { sourceFileId },
  })
  return result.count
}
