/**
 * Validation Portal Service
 * Manages supervisor validation for staff payments
 */

import { prisma } from '@/app/lib/db'
import { ValidationStatus, PayPeriodStatus } from '@prisma/client'
import {
  ValidateStaffDto,
  BulkValidateDto,
  ValidationSummaryResponse,
} from './types'

/**
 * Ensure validation window is open
 */
async function ensureValidationWindowOpen(payPeriodId: string): Promise<void> {
  const period = await prisma.payPeriod.findUnique({
    where: { id: payPeriodId },
  })

  if (!period) {
    throw new Error(`Payroll period ${payPeriodId} not found`)
  }

  if (period.status !== PayPeriodStatus.VALIDATION_OPEN) {
    throw new Error(
      `Validation window is not open. Current status: ${period.status}`
    )
  }
}

/**
 * Initialize validation records for all staff when validation window opens
 */
export async function initializeValidations(
  payPeriodId: string,
  staffIds: string[],
  companyId: string
): Promise<number> {
  let created = 0

  for (const staffId of staffIds) {
    try {
      await prisma.payValidation.upsert({
        where: {
          payPeriodId_staffId: {
            payPeriodId,
            staffId,
          },
        },
        create: {
          payPeriodId,
          staffId,
          companyId,
          status: ValidationStatus.PENDING,
        },
        update: {}, // No updates if already exists
      })
      created++
    } catch (error) {
      // Ignore duplicates
    }
  }

  return created
}

/**
 * Get team members for validation by a supervisor
 */
export async function getTeamForValidation(
  payPeriodId: string,
  supervisorId: string,
  companyId: string
) {
  await ensureValidationWindowOpen(payPeriodId)

  return prisma.payValidation.findMany({
    where: {
      payPeriodId,
      companyId,
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
    orderBy: { status: 'asc' }, // Pending first
  })
}

/**
 * Validate a single staff member
 */
export async function validateStaff(
  dto: ValidateStaffDto,
  supervisorId: string,
  companyId: string
) {
  await ensureValidationWindowOpen(dto.payPeriodId)

  // Require reason for NO_FOR_PAYMENT
  if (dto.status === 'NO_FOR_PAYMENT' && !dto.reason) {
    throw new Error('Reason is required when withholding payment')
  }

  return prisma.payValidation.upsert({
    where: {
      payPeriodId_staffId: {
        payPeriodId: dto.payPeriodId,
        staffId: dto.staffId,
      },
    },
    create: {
      payPeriodId: dto.payPeriodId,
      staffId: dto.staffId,
      companyId,
      status: dto.status as ValidationStatus,
      reason: dto.reason || null,
      supervisorId,
      validatedAt: new Date(),
    },
    update: {
      status: dto.status as ValidationStatus,
      reason: dto.reason || null,
      supervisorId,
      validatedAt: new Date(),
    },
  })
}

/**
 * Bulk validate multiple staff members
 */
export async function bulkValidate(
  dto: BulkValidateDto,
  supervisorId: string,
  companyId: string
): Promise<{ updated: number; errors: string[] }> {
  await ensureValidationWindowOpen(dto.payPeriodId)

  const results = { updated: 0, errors: [] as string[] }

  for (const validation of dto.validations) {
    try {
      // Normalize status to uppercase
      const normalizedStatus = validation.status.toUpperCase() as 'YES_FOR_PAYMENT' | 'NO_FOR_PAYMENT'

      // Require reason for NO_FOR_PAYMENT
      if (normalizedStatus === 'NO_FOR_PAYMENT' && !validation.reason) {
        results.errors.push(`Staff ${validation.staffId}: Reason is required when withholding payment`)
        continue
      }

      await prisma.payValidation.upsert({
        where: {
          payPeriodId_staffId: {
            payPeriodId: dto.payPeriodId,
            staffId: validation.staffId,
          },
        },
        create: {
          payPeriodId: dto.payPeriodId,
          staffId: validation.staffId,
          companyId,
          status: normalizedStatus as ValidationStatus,
          reason: validation.reason || null,
          supervisorId,
          validatedAt: new Date(),
        },
        update: {
          status: normalizedStatus as ValidationStatus,
          reason: validation.reason || null,
          supervisorId,
          validatedAt: new Date(),
        },
      })
      results.updated++
    } catch (error: any) {
      results.errors.push(`Staff ${validation.staffId}: ${error.message}`)
    }
  }

  return results
}

/**
 * Get validation summary for a payroll period
 */
export async function getValidationSummary(
  payPeriodId: string,
  companyId: string
): Promise<ValidationSummaryResponse> {
  const [total, pending, yesForPayment, noForPayment] = await Promise.all([
    prisma.payValidation.count({
      where: { payPeriodId, companyId },
    }),
    prisma.payValidation.count({
      where: { payPeriodId, companyId, status: ValidationStatus.PENDING },
    }),
    prisma.payValidation.count({
      where: { payPeriodId, companyId, status: ValidationStatus.YES_FOR_PAYMENT },
    }),
    prisma.payValidation.count({
      where: { payPeriodId, companyId, status: ValidationStatus.NO_FOR_PAYMENT },
    }),
  ])

  const completed = yesForPayment + noForPayment
  const percentageCompleted = total > 0 ? (completed / total) * 100 : 0

  return {
    total,
    pending,
    yesForPayment,
    noForPayment,
    percentageCompleted: Math.round(percentageCompleted * 100) / 100,
  }
}

/**
 * Get pending validations for a period
 */
export async function getPendingValidations(
  payPeriodId: string,
  companyId: string
) {
  return prisma.payValidation.findMany({
    where: {
      payPeriodId,
      companyId,
      status: ValidationStatus.PENDING,
    },
    include: {
      staff: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          department: true,
        },
      },
    },
  })
}

/**
 * Get withheld staff for a period
 */
export async function getWithheldStaff(payPeriodId: string, companyId: string) {
  return prisma.payValidation.findMany({
    where: {
      payPeriodId,
      companyId,
      status: ValidationStatus.NO_FOR_PAYMENT,
    },
    include: {
      staff: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          department: true,
        },
      },
      supervisor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  })
}

/**
 * Get validation status for a specific staff member
 */
export async function getStaffValidation(payPeriodId: string, staffId: string) {
  return prisma.payValidation.findUnique({
    where: {
      payPeriodId_staffId: {
        payPeriodId,
        staffId,
      },
    },
  })
}
