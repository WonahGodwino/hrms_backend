/**
 * Pay Period Service
 * Manages payroll period lifecycle and state transitions
 */

import { prisma } from '@/app/lib/db'
import { PayPeriodStatus } from '@prisma/client'
import {
  CreatePayPeriodDto,
  UpdatePayPeriodDto,
  QueryPayPeriodDto,
} from './types'

// Valid state transitions
const validTransitions: Record<PayPeriodStatus, PayPeriodStatus[]> = {
  [PayPeriodStatus.DRAFT]: [PayPeriodStatus.VALIDATION_OPEN],
  [PayPeriodStatus.VALIDATION_OPEN]: [PayPeriodStatus.VALIDATION_CLOSED],
  [PayPeriodStatus.VALIDATION_CLOSED]: [PayPeriodStatus.COMPUTING],
  [PayPeriodStatus.COMPUTING]: [PayPeriodStatus.REVIEW],
  [PayPeriodStatus.REVIEW]: [PayPeriodStatus.APPROVED, PayPeriodStatus.COMPUTING],
  [PayPeriodStatus.APPROVED]: [PayPeriodStatus.PAID],
  [PayPeriodStatus.PAID]: [],
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Create a new payroll period
 */
export async function createPayPeriod(
  dto: CreatePayPeriodDto,
  companyId: string,
  userId: string
) {
  // Check if period already exists
  const existing = await prisma.payPeriod.findUnique({
    where: {
      companyId_year_month: {
        companyId,
        year: dto.year,
        month: dto.month,
      },
    },
  })

  if (existing) {
    throw new Error(`Payroll period for ${dto.month}/${dto.year} already exists`)
  }

  // Calculate period dates
  const startDate = new Date(dto.year, dto.month - 1, 1)
  const endDate = new Date(dto.year, dto.month, 0) // Last day of month

  // Validation window: 14th - 16th of the month
  const validationWindowStart = new Date(dto.year, dto.month - 1, 14)
  const validationWindowEnd = new Date(dto.year, dto.month - 1, 16, 23, 59, 59)

  const periodName = `${MONTH_NAMES[dto.month - 1]} ${dto.year}`

  return prisma.payPeriod.create({
    data: {
      year: dto.year,
      month: dto.month,
      periodName,
      startDate,
      endDate,
      validationWindowStart,
      validationWindowEnd,
      standardMonthlyHours: dto.standardMonthlyHours || 176,
      status: PayPeriodStatus.DRAFT,
      companyId,
      createdBy: userId,
    },
  })
}

/**
 * Get all payroll periods for a company
 */
export async function getPayPeriods(companyId: string, query: QueryPayPeriodDto) {
  const { page = 1, limit = 10, year, status } = query

  const where: any = { companyId }
  if (year) where.year = year
  if (status) where.status = status as PayPeriodStatus

  const [data, total] = await Promise.all([
    prisma.payPeriod.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.payPeriod.count({ where }),
  ])

  return { data, total, page, limit }
}

/**
 * Get a single payroll period by ID
 */
export async function getPayPeriodById(id: string) {
  const period = await prisma.payPeriod.findUnique({
    where: { id },
  })

  if (!period) {
    throw new Error(`Payroll period ${id} not found`)
  }

  return period
}

/**
 * Update payroll period
 */
export async function updatePayPeriod(id: string, dto: UpdatePayPeriodDto) {
  const period = await prisma.payPeriod.findUnique({
    where: { id },
  })

  if (!period) {
    throw new Error(`Payroll period ${id} not found`)
  }

  if (period.status !== PayPeriodStatus.DRAFT) {
    throw new Error('Can only update payroll periods in DRAFT status')
  }

  return prisma.payPeriod.update({
    where: { id },
    data: dto,
  })
}

/**
 * Update payroll period status with validation
 */
export async function updateStatus(
  id: string,
  newStatus: PayPeriodStatus,
  userId?: string
) {
  const period = await prisma.payPeriod.findUnique({
    where: { id },
  })

  if (!period) {
    throw new Error(`Payroll period ${id} not found`)
  }

  // Validate state transition
  const allowedTransitions = validTransitions[period.status]
  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(`Cannot transition from ${period.status} to ${newStatus}`)
  }

  const updateData: any = { status: newStatus }

  // Set approval data if transitioning to APPROVED
  if (newStatus === PayPeriodStatus.APPROVED && userId) {
    updateData.approvedBy = userId
    updateData.approvedAt = new Date()
  }

  return prisma.payPeriod.update({
    where: { id },
    data: updateData,
  })
}

/**
 * Open validation window (transition to VALIDATION_OPEN)
 */
export async function openValidationWindow(id: string) {
  return updateStatus(id, PayPeriodStatus.VALIDATION_OPEN)
}

/**
 * Close validation window (transition to VALIDATION_CLOSED)
 */
export async function closeValidationWindow(id: string) {
  return updateStatus(id, PayPeriodStatus.VALIDATION_CLOSED)
}

/**
 * Check if validation window is open for a period
 */
export async function isValidationWindowOpen(id: string): Promise<boolean> {
  const period = await prisma.payPeriod.findUnique({
    where: { id },
  })
  if (!period) return false

  return period.status === PayPeriodStatus.VALIDATION_OPEN
}

/**
 * Get the current active period for a company
 */
export async function getCurrentPeriod(companyId: string) {
  return prisma.payPeriod.findFirst({
    where: {
      companyId,
      status: { not: PayPeriodStatus.PAID },
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })
}

/**
 * Get valid status transitions for a given status
 */
export function getValidTransitions(status: PayPeriodStatus): PayPeriodStatus[] {
  return validTransitions[status] || []
}
