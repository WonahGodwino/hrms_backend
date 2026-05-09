import { PrismaClient, Prisma } from '@prisma/client'

type PrismaLikeClient = PrismaClient | Prisma.TransactionClient

interface EnsureStaffLeaveBalancesParams {
  prisma: PrismaLikeClient
  staffRecordId: string
  year?: number
}

function getAccruedEntitlementDays(
  year: number,
  maxDays: number,
  accrualRate: number | null | undefined,
  employmentDate: Date
): number {
  const annualCap = Math.max(maxDays ?? 0, 0)
  const normalizedRate = accrualRate ?? 0

  if (normalizedRate <= 0) {
    return annualCap
  }

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  if (year > currentYear) {
    return 0
  }

  const accrualEndMonth = year < currentYear ? 12 : currentMonth

  let accrualStartMonth = 1
  if (employmentDate.getFullYear() > year) {
    return 0
  }
  if (employmentDate.getFullYear() === year) {
    accrualStartMonth = employmentDate.getMonth() + 1
  }

  const monthsAccrued = Math.max(accrualEndMonth - accrualStartMonth + 1, 0)
  const accruedDays = Math.floor(monthsAccrued * normalizedRate)

  return Math.min(accruedDays, annualCap)
}

function getEffectiveCarryOver(
  policyCarryOverLimit: number,
  previousYearBalance?: {
    totalDays: number
    usedDays: number
    pendingDays: number
  }
): number {
  if (policyCarryOverLimit <= 0) return 0

  if (!previousYearBalance) {
    // Business rule requested: fallback to policy max when no previous-year details exist.
    return policyCarryOverLimit
  }

  const previousAvailable = Math.max(
    previousYearBalance.totalDays - previousYearBalance.usedDays - previousYearBalance.pendingDays,
    0
  )

  if (previousAvailable > policyCarryOverLimit) {
    return policyCarryOverLimit
  }

  return previousAvailable
}

export async function ensureStaffLeaveBalances({
  prisma,
  staffRecordId,
  year = new Date().getFullYear(),
}: EnsureStaffLeaveBalancesParams) {
  const staff = await prisma.staffRecord.findUnique({
    where: { id: staffRecordId },
    select: {
      id: true,
      companyId: true,
      isActive: true,
      createdAt: true,
    },
  })

  if (!staff || !staff.isActive) {
    return { created: 0, updated: 0, skipped: true }
  }

  const activeLeaveTypes = await prisma.leaveType.findMany({
    where: {
      isActive: true,
      policy: {
        companyId: staff.companyId,
      },
    },
    select: {
      id: true,
      policy: {
        select: {
          maxDays: true,
          carryOver: true,
          accrualRate: true,
        },
      },
    },
  })

  if (activeLeaveTypes.length === 0) {
    return { created: 0, updated: 0, skipped: false }
  }

  const leaveTypeIds = activeLeaveTypes.map((leaveType) => leaveType.id)

  const [currentYearBalances, previousYearBalances] = await Promise.all([
    prisma.staffLeaveBalance.findMany({
      where: {
        staffRecordId,
        year,
        leaveTypeId: { in: leaveTypeIds },
      },
      select: {
        id: true,
        leaveTypeId: true,
        totalDays: true,
        usedDays: true,
        pendingDays: true,
        carriedOver: true,
      },
    }),
    prisma.staffLeaveBalance.findMany({
      where: {
        staffRecordId,
        year: year - 1,
        leaveTypeId: { in: leaveTypeIds },
      },
      select: {
        leaveTypeId: true,
        totalDays: true,
        usedDays: true,
        pendingDays: true,
      },
    }),
  ])

  const currentByLeaveType = new Map(
    currentYearBalances.map((balance) => [balance.leaveTypeId, balance])
  )
  const previousByLeaveType = new Map(
    previousYearBalances.map((balance) => [balance.leaveTypeId, balance])
  )

  let created = 0
  let updated = 0

  for (const leaveType of activeLeaveTypes) {
    const policyMaxDays = Math.max(leaveType.policy.maxDays ?? 0, 0)
    const policyCarryOverLimit = Math.max(leaveType.policy.carryOver ?? 0, 0)
    const accruedEntitlementDays = getAccruedEntitlementDays(
      year,
      policyMaxDays,
      leaveType.policy.accrualRate,
      staff.createdAt
    )

    const effectiveCarryOver = getEffectiveCarryOver(
      policyCarryOverLimit,
      previousByLeaveType.get(leaveType.id)
    )
    const computedTotalDays = accruedEntitlementDays + effectiveCarryOver
    const existing = currentByLeaveType.get(leaveType.id)

    if (!existing) {
      await prisma.staffLeaveBalance.create({
        data: {
          staffRecordId,
          leaveTypeId: leaveType.id,
          year,
          totalDays: computedTotalDays,
          usedDays: 0,
          pendingDays: 0,
          carriedOver: effectiveCarryOver,
        },
      })
      created++
      continue
    }

    const needsUpdate =
      existing.totalDays !== computedTotalDays ||
      existing.carriedOver !== effectiveCarryOver

    if (needsUpdate) {
      await prisma.staffLeaveBalance.update({
        where: { id: existing.id },
        data: {
          totalDays: computedTotalDays,
          carriedOver: effectiveCarryOver,
        },
      })
      updated++
    }
  }

  return { created, updated, skipped: false }
}
