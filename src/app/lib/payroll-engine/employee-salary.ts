/**
 * Employee Salary Service
 * Manages salary structures for employees
 */

import { prisma } from '@/app/lib/db'
import { EmployeeCategory, Prisma } from '@prisma/client'
import {
  CreateEmployeeSalaryDto,
  UpdateEmployeeSalaryDto,
  QueryEmployeeSalaryDto,
} from './types'

/**
 * Create a new salary structure for an employee
 */
export async function createSalaryStructure(
  dto: CreateEmployeeSalaryDto,
  companyId: string
) {
  // Check if active salary structure already exists
  const existing = await prisma.employeeSalary.findFirst({
    where: {
      staffId: dto.staffId,
      companyId,
      isActive: true,
    },
  })

  if (existing) {
    throw new Error(
      'Active salary structure already exists for this employee. Update the existing one or deactivate it first.'
    )
  }

  return prisma.employeeSalary.create({
    data: {
      staffId: dto.staffId,
      companyId,
      employeeCategory: (dto.employeeCategory as EmployeeCategory) || EmployeeCategory.REGULAR,
      basicSalary: dto.basicSalary,
      housingAllowance: dto.housingAllowance || 0,
      transportAllowance: dto.transportAllowance || 0,
      dressingAllowance: dto.dressingAllowance || 0,
      leaveAllowance: dto.leaveAllowance || 0,
      entertainmentAllowance: dto.entertainmentAllowance || 0,
      utilityAllowance: dto.utilityAllowance || 0,
      otherAllowances: dto.otherAllowances || 0,
      annualRent: dto.annualRent || 0,
      bankName: dto.bankName,
      accountNumber: dto.accountNumber,
      accountName: dto.accountName,
      pensionFundAdministrator: dto.pensionFundAdministrator,
      pensionPin: dto.pensionPin,
      isActive: true,
      effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : new Date(),
    },
  })
}

/**
 * Update an existing salary structure
 */
export async function updateSalaryStructure(
  staffId: string,
  dto: UpdateEmployeeSalaryDto,
  companyId: string
) {
  const salaryStructure = await prisma.employeeSalary.findFirst({
    where: {
      staffId,
      companyId,
      isActive: true,
    },
  })

  if (!salaryStructure) {
    throw new Error(`No active salary structure found for staff ${staffId}`)
  }

  const updateData: any = {}

  if (dto.employeeCategory !== undefined) updateData.employeeCategory = dto.employeeCategory
  if (dto.basicSalary !== undefined) updateData.basicSalary = dto.basicSalary
  if (dto.housingAllowance !== undefined) updateData.housingAllowance = dto.housingAllowance
  if (dto.transportAllowance !== undefined) updateData.transportAllowance = dto.transportAllowance
  if (dto.dressingAllowance !== undefined) updateData.dressingAllowance = dto.dressingAllowance
  if (dto.leaveAllowance !== undefined) updateData.leaveAllowance = dto.leaveAllowance
  if (dto.entertainmentAllowance !== undefined) updateData.entertainmentAllowance = dto.entertainmentAllowance
  if (dto.utilityAllowance !== undefined) updateData.utilityAllowance = dto.utilityAllowance
  if (dto.otherAllowances !== undefined) updateData.otherAllowances = dto.otherAllowances
  if (dto.annualRent !== undefined) updateData.annualRent = dto.annualRent
  if (dto.bankName !== undefined) updateData.bankName = dto.bankName
  if (dto.accountNumber !== undefined) updateData.accountNumber = dto.accountNumber
  if (dto.accountName !== undefined) updateData.accountName = dto.accountName
  if (dto.pensionFundAdministrator !== undefined) updateData.pensionFundAdministrator = dto.pensionFundAdministrator
  if (dto.pensionPin !== undefined) updateData.pensionPin = dto.pensionPin
  if (dto.effectiveDate !== undefined) updateData.effectiveDate = new Date(dto.effectiveDate)

  return prisma.employeeSalary.update({
    where: { id: salaryStructure.id },
    data: updateData,
  })
}

/**
 * Get salary structure for a specific employee
 */
export async function getSalaryStructure(staffId: string, companyId: string) {
  const salaryStructure = await prisma.employeeSalary.findFirst({
    where: {
      staffId,
      companyId,
      isActive: true,
    },
    include: {
      staff: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          department: true,
          position: true,
        },
      },
    },
  })

  if (!salaryStructure) {
    throw new Error(`No active salary structure found for staff ${staffId}`)
  }

  return salaryStructure
}

/**
 * Get all salary structures for a company
 */
export async function getAllSalaryStructures(
  companyId: string,
  query: QueryEmployeeSalaryDto
) {
  const { page = 1, limit = 10, isActive, employeeCategory } = query

  const where: any = { companyId }
  if (isActive !== undefined) where.isActive = isActive
  if (employeeCategory) where.employeeCategory = employeeCategory

  const [data, total] = await Promise.all([
    prisma.employeeSalary.findMany({
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
            department: true,
            position: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.employeeSalary.count({ where }),
  ])

  return { data, total, page, limit }
}

/**
 * Deactivate a salary structure
 */
export async function deactivateSalaryStructure(
  staffId: string,
  companyId: string
) {
  const salaryStructure = await prisma.employeeSalary.findFirst({
    where: {
      staffId,
      companyId,
      isActive: true,
    },
  })

  if (!salaryStructure) {
    throw new Error(`No active salary structure found for staff ${staffId}`)
  }

  return prisma.employeeSalary.update({
    where: { id: salaryStructure.id },
    data: { isActive: false },
  })
}

/**
 * Get all active salary structures for payroll computation
 */
export async function getActiveSalaryStructures(companyId: string) {
  return prisma.employeeSalary.findMany({
    where: {
      companyId,
      isActive: true,
    },
    include: {
      staff: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          department: true,
          position: true,
        },
      },
    },
  })
}

/**
 * Bulk import salary structures from parsed CSV/Excel data
 */
export async function bulkImportSalaryStructures(
  data: CreateEmployeeSalaryDto[],
  companyId: string
) {
  const results = { created: 0, updated: 0, errors: [] as string[] }

  for (const row of data) {
    try {
      const existing = await prisma.employeeSalary.findFirst({
        where: {
          staffId: row.staffId,
          companyId,
          isActive: true,
        },
      })

      if (existing) {
        await prisma.employeeSalary.update({
          where: { id: existing.id },
          data: {
            basicSalary: row.basicSalary,
            housingAllowance: row.housingAllowance || 0,
            transportAllowance: row.transportAllowance || 0,
            dressingAllowance: row.dressingAllowance || 0,
            leaveAllowance: row.leaveAllowance || 0,
            entertainmentAllowance: row.entertainmentAllowance || 0,
            utilityAllowance: row.utilityAllowance || 0,
            otherAllowances: row.otherAllowances || 0,
            annualRent: row.annualRent || 0,
            bankName: row.bankName,
            accountNumber: row.accountNumber,
            accountName: row.accountName,
            pensionFundAdministrator: row.pensionFundAdministrator,
            pensionPin: row.pensionPin,
          },
        })
        results.updated++
      } else {
        await createSalaryStructure(row, companyId)
        results.created++
      }
    } catch (error: any) {
      results.errors.push(`Staff ${row.staffId}: ${error.message}`)
    }
  }

  return results
}

/**
 * Calculate monthly gross salary for an employee
 */
export function calculateMonthlyGross(salary: {
  basicSalary: Prisma.Decimal | number
  housingAllowance?: Prisma.Decimal | number | null
  transportAllowance?: Prisma.Decimal | number | null
  dressingAllowance?: Prisma.Decimal | number | null
  leaveAllowance?: Prisma.Decimal | number | null
  entertainmentAllowance?: Prisma.Decimal | number | null
  utilityAllowance?: Prisma.Decimal | number | null
  otherAllowances?: Prisma.Decimal | number | null
}): number {
  const toNumber = (val: Prisma.Decimal | number | null | undefined): number => {
    if (val === null || val === undefined) return 0
    return typeof val === 'number' ? val : Number(val)
  }

  return (
    toNumber(salary.basicSalary) +
    toNumber(salary.housingAllowance) +
    toNumber(salary.transportAllowance) +
    toNumber(salary.dressingAllowance) +
    toNumber(salary.leaveAllowance) +
    toNumber(salary.entertainmentAllowance) +
    toNumber(salary.utilityAllowance) +
    toNumber(salary.otherAllowances)
  )
}
