/**
 * Deductions Service
 * Manages various deduction entries for payroll computation
 */

import { prisma } from '@/app/lib/db'
import { DeductionType } from '@prisma/client'
import {
  CreateDeductionEntryDto,
  QueryDeductionEntryDto,
  StaffDeductionsSummary,
  DeductionSummaryByType,
} from './types'

/**
 * Create a single deduction entry
 */
export async function createDeductionEntry(
  dto: CreateDeductionEntryDto,
  companyId: string
) {
  return prisma.deductionEntry.create({
    data: {
      payPeriodId: dto.payPeriodId,
      staffId: dto.staffId,
      companyId,
      deductionType: dto.deductionType as DeductionType,
      amount: dto.amount,
      description: dto.description,
    },
  })
}

/**
 * Get deduction entries by period
 */
export async function getDeductionsByPeriod(
  payPeriodId: string,
  companyId: string,
  query: QueryDeductionEntryDto
) {
  const { page = 1, limit = 10, staffId, deductionType } = query

  const where: any = { payPeriodId, companyId }
  if (staffId) where.staffId = staffId
  if (deductionType) where.deductionType = deductionType

  const [data, total] = await Promise.all([
    prisma.deductionEntry.findMany({
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
    prisma.deductionEntry.count({ where }),
  ])

  return { data, total, page, limit }
}

/**
 * Get all deductions for a staff member in a period (grouped by type)
 */
export async function getStaffDeductions(
  payPeriodId: string,
  staffId: string
): Promise<StaffDeductionsSummary> {
  const entries = await prisma.deductionEntry.findMany({
    where: { payPeriodId, staffId },
  })

  const result: StaffDeductionsSummary = {
    unionDues: 0,
    cooperativeDeduction: 0,
    loanRepayment: 0,
    otherDeductions: 0,
    total: 0,
  }

  for (const entry of entries) {
    const amount = Number(entry.amount)
    switch (entry.deductionType) {
      case DeductionType.UNION_DUES:
        result.unionDues += amount
        break
      case DeductionType.COOPERATIVE:
        result.cooperativeDeduction += amount
        break
      case DeductionType.LOAN:
      case DeductionType.SALARY_ADVANCE:
        result.loanRepayment += amount
        break
      default:
        result.otherDeductions += amount
    }
    result.total += amount
  }

  return result
}

/**
 * Delete a deduction entry
 */
export async function deleteDeductionEntry(id: string): Promise<void> {
  const result = await prisma.deductionEntry.delete({
    where: { id },
  }).catch(() => null)

  if (!result) {
    throw new Error(`Deduction entry ${id} not found`)
  }
}

/**
 * Bulk import deductions from CSV
 */
export async function bulkImportDeductions(
  payPeriodId: string,
  deductionType: DeductionType,
  data: { staffId: string; amount: number; description?: string }[],
  companyId: string,
  sourceFileId?: string
) {
  const results = { created: 0, errors: [] as string[] }

  for (const row of data) {
    try {
      await prisma.deductionEntry.create({
        data: {
          payPeriodId,
          staffId: row.staffId,
          deductionType,
          amount: row.amount,
          description: row.description,
          companyId,
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
 * Get deduction summary by type for a period
 */
export async function getDeductionSummaryByType(
  payPeriodId: string,
  companyId: string
): Promise<DeductionSummaryByType[]> {
  const entries = await prisma.deductionEntry.groupBy({
    by: ['deductionType'],
    where: { payPeriodId, companyId },
    _count: { id: true },
    _sum: { amount: true },
  })

  return entries.map((entry) => ({
    type: entry.deductionType,
    count: entry._count.id,
    totalAmount: Number(entry._sum.amount) || 0,
  }))
}

/**
 * Delete all deductions from a source file
 */
export async function deleteBySourceFile(sourceFileId: string): Promise<number> {
  const result = await prisma.deductionEntry.deleteMany({
    where: { sourceFileId },
  })
  return result.count
}
