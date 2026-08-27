// src/app/lib/staff/transferStaffCompany.ts
//
// Moves a STAFF-role StaffRecord to a different company, along with every
// "own-record" table that references it (payroll, payslips, attendance,
// leave requests, etc.), inside a single prisma.$transaction. Company-scoped
// assignments that don't carry over (department/grade/designation/location/
// manager) are cleared unless the caller supplies destination-company
// replacements. Deliberately does NOT touch secondary-actor fields
// (approvers/reviewers/supervisors), historical-event tables (Onboarding,
// Offboarding, DepartmentStaffHistory, TrainingAuditLog), or anything PHED
// (PhedStaffAccessRole, PhedApprovalStamp, and the "Payroll Engine" models
// EmployeeSalary/PayValidation/OvertimeEntry/DeductionEntry/ComputedPayslip,
// which despite their plain names are exclusively PHED's "Pay Period
// Workflow" data — confirmed via their only call sites being
// backend/src/app/api/phed/pay-periods/**).
import { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/db'
import { getAccessibleCompanies } from '@/app/lib/reporting/access'

export type TransferInput = {
  staffRecordId: string
  toCompanyId: string
  newDepartmentId?: string | null
  newGradeId?: string | null
  newDesignationId?: string | null
  newLocationId?: string | null
  reason?: string | null
}

export type BulkTransferInput = {
  staffRecordIds: string[]
  toCompanyId: string
  newDepartmentId?: string | null
  newGradeId?: string | null
  newDesignationId?: string | null
  newLocationId?: string | null
  reason?: string | null
}

export type ActingUser = { userId: string; role: string }

// [Prisma model accessor, FK field on that model, human label for the UI/audit log]
const OWN_RECORD_TABLES: Array<{ model: string; field: string; label: string }> = [
  { model: 'payroll', field: 'staffRecordId', label: 'Payroll' },
  { model: 'payslip', field: 'staffRecordId', label: 'Payslips' },
  { model: 'attendance', field: 'staffId', label: 'Attendance' },
  { model: 'leaveRequest', field: 'staffRecordId', label: 'Leave Requests' },
  { model: 'notification', field: 'userId', label: 'Notifications' },
  { model: 'emailLog', field: 'staffId', label: 'Email Logs' },
  { model: 'payrollData', field: 'staffId', label: 'Payroll Data' },
  { model: 'employeeTaxProfile', field: 'staffId', label: 'Tax Profile' },
  { model: 'assessmentAttempt', field: 'employeeId', label: 'Assessment Attempts' },
  { model: 'participantProgress', field: 'employeeId', label: 'Training Progress' },
  { model: 'certificationRecord', field: 'employeeId', label: 'Certification Records' },
  { model: 'roleElevation', field: 'staffId', label: 'Role Elevations' },
  { model: 'staffSalaryHistory', field: 'staffId', label: 'Salary History' },
  { model: 'staffGradeHistory', field: 'staffId', label: 'Grade History' },
  { model: 'loanRequest', field: 'staffId', label: 'Loan Requests' },
  { model: 'benefitRequest', field: 'staffId', label: 'Benefit Requests' },
  { model: 'benefitAllocation', field: 'staffId', label: 'Benefit Allocations' }
]

export class TransferValidationError extends Error {}

async function validateTransfer(actingUser: ActingUser, input: TransferInput) {
  if (!['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
    throw new TransferValidationError('Only ADMIN or SUPER_ADMIN can transfer staff between companies')
  }

  const staff = await prisma.staffRecord.findUnique({ where: { id: input.staffRecordId } })
  if (!staff) throw new TransferValidationError('Staff record not found')
  if (staff.role !== 'STAFF') {
    throw new TransferValidationError('Only STAFF-role records can be transferred this way — ADMIN/HR/MANAGER access moves via company assignment instead')
  }
  if (staff.companyId === input.toCompanyId) {
    throw new TransferValidationError('Staff member is already in the destination company')
  }

  const destinationCompany = await prisma.company.findFirst({ where: { id: input.toCompanyId, archived: 0 } })
  if (!destinationCompany) throw new TransferValidationError('Destination company not found')

  if (actingUser.role === 'ADMIN') {
    const accessible = await getAccessibleCompanies(actingUser)
    if (!accessible.some((c) => c.companyId === input.toCompanyId)) {
      throw new TransferValidationError('You do not have access to the destination company')
    }
  }

  const staffIdCollision = await prisma.staffRecord.findFirst({
    where: { companyId: input.toCompanyId, staffId: staff.staffId }
  })
  if (staffIdCollision) {
    throw new TransferValidationError(`A staff member with ID "${staff.staffId}" already exists in the destination company`)
  }

  const emailCollision = await prisma.staffRecord.findFirst({
    where: { companyId: input.toCompanyId, email: staff.email }
  })
  if (emailCollision) {
    throw new TransferValidationError(`A staff member with email "${staff.email}" already exists in the destination company`)
  }

  // Compound-unique tables (companyId is part of the key) — check for any
  // overlapping period/date before attempting the bulk reassignment,
  // otherwise the updateMany would fail mid-transaction with a raw
  // constraint error instead of a clear message.
  const [existingPayPeriods, destinationPayPeriods] = await Promise.all([
    prisma.payrollData.findMany({ where: { staffId: staff.id, companyId: staff.companyId }, select: { payPeriod: true } }),
    prisma.payrollData.findMany({ where: { staffId: staff.id, companyId: input.toCompanyId }, select: { payPeriod: true } })
  ])
  const overlappingPeriods = existingPayPeriods.map((p) => p.payPeriod).filter((p) => destinationPayPeriods.some((d) => d.payPeriod === p))
  if (overlappingPeriods.length > 0) {
    throw new TransferValidationError(`Payroll data already exists in the destination company for period(s): ${overlappingPeriods.join(', ')}`)
  }

  const [existingAttendanceDates, destinationAttendanceDates] = await Promise.all([
    prisma.attendance.findMany({ where: { staffId: staff.id, companyId: staff.companyId }, select: { date: true } }),
    prisma.attendance.findMany({ where: { staffId: staff.id, companyId: input.toCompanyId }, select: { date: true } })
  ])
  const destinationDateSet = new Set(destinationAttendanceDates.map((d) => d.date.toISOString()))
  const overlappingDates = existingAttendanceDates.filter((d) => destinationDateSet.has(d.date.toISOString()))
  if (overlappingDates.length > 0) {
    throw new TransferValidationError(`Attendance records already exist in the destination company for ${overlappingDates.length} overlapping date(s)`)
  }

  return staff
}

export async function previewStaffTransfer(actingUser: ActingUser, input: TransferInput) {
  const staff = await validateTransfer(actingUser, input)

  const counts: Record<string, number> = {}
  for (const table of OWN_RECORD_TABLES) {
    const count = await (prisma as any)[table.model].count({
      where: { [table.field]: staff.id, companyId: staff.companyId }
    })
    counts[table.label] = count
  }

  return {
    staffId: staff.staffId,
    staffName: `${staff.firstName} ${staff.lastName}`,
    fromCompanyId: staff.companyId,
    toCompanyId: input.toCompanyId,
    recordCounts: counts
  }
}

export async function executeStaffTransfer(actingUser: ActingUser, input: TransferInput) {
  const staff = await validateTransfer(actingUser, input)

  const previousDepartmentId = staff.departmentId
  const previousGradeId = staff.currentGradeId
  const previousDesignationId = staff.designationId
  const previousLocationId = staff.locationId
  const previousManagerId = staff.managerId

  // Default interactive-transaction timeout (5s) is too tight for this many
  // sequential round-trips (staff update + head-reference cleanup + 17
  // own-record table reassignments + audit log) — raised per Prisma's own
  // guidance on the "expired transaction" error.
  const result = await prisma.$transaction(async (tx) => {
    const gradeAssigned = Boolean(input.newGradeId)

    await tx.staffRecord.update({
      where: { id: staff.id },
      data: {
        companyId: input.toCompanyId,
        department: null,
        departmentId: input.newDepartmentId ?? null,
        currentGradeId: input.newGradeId ?? null,
        currentGradeStep: gradeAssigned ? 1 : null,
        gradeLevelStartDate: gradeAssigned ? new Date() : null,
        gradeBasicSalary: null,
        gradeAllowances: Prisma.DbNull,
        designationId: input.newDesignationId ?? null,
        location: null,
        locationId: input.newLocationId ?? null,
        managerId: null
      }
    })

    // Clear dangling "head of" references left behind in the old company.
    await tx.department.updateMany({ where: { headId: staff.id }, data: { headId: null } })
    await tx.department.updateMany({ where: { assistantHeadId: staff.id }, data: { assistantHeadId: null } })
    await tx.businessUnit.updateMany({ where: { headId: staff.id }, data: { headId: null } })
    await tx.businessUnit.updateMany({ where: { assistantHeadId: staff.id }, data: { assistantHeadId: null } })

    const recordCounts: Record<string, number> = {}
    for (const table of OWN_RECORD_TABLES) {
      const updateResult = await (tx as any)[table.model].updateMany({
        where: { [table.field]: staff.id, companyId: staff.companyId },
        data: { companyId: input.toCompanyId }
      })
      recordCounts[table.label] = updateResult.count
    }

    const transferRecord = await tx.staffCompanyTransfer.create({
      data: {
        staffRecordId: staff.id,
        fromCompanyId: staff.companyId,
        toCompanyId: input.toCompanyId,
        transferredBy: actingUser.userId,
        reason: input.reason ?? null,
        previousDepartmentId,
        previousGradeId,
        previousDesignationId,
        previousLocationId,
        previousManagerId,
        newDepartmentId: input.newDepartmentId ?? null,
        newGradeId: input.newGradeId ?? null,
        newDesignationId: input.newDesignationId ?? null,
        newLocationId: input.newLocationId ?? null,
        recordCounts
      }
    })

    return { recordCounts, transferId: transferRecord.id }
  }, { timeout: 20000, maxWait: 10000 })

  return {
    staffId: staff.staffId,
    staffName: `${staff.firstName} ${staff.lastName}`,
    fromCompanyId: staff.companyId,
    toCompanyId: input.toCompanyId,
    ...result
  }
}

// Bulk variants — the same destination/placement is applied to every staff
// member in the list, but each one gets its own independent validation and
// $transaction (via the single-staff functions above), so one staff's
// collision doesn't block the rest of the batch. Callers get a per-staff
// success/failure breakdown rather than an all-or-nothing outcome.
function toSingleInput(bulkInput: BulkTransferInput, staffRecordId: string): TransferInput {
  return {
    staffRecordId,
    toCompanyId: bulkInput.toCompanyId,
    newDepartmentId: bulkInput.newDepartmentId,
    newGradeId: bulkInput.newGradeId,
    newDesignationId: bulkInput.newDesignationId,
    newLocationId: bulkInput.newLocationId,
    reason: bulkInput.reason
  }
}

export async function previewBulkStaffTransfer(actingUser: ActingUser, input: BulkTransferInput) {
  const results = await Promise.all(
    input.staffRecordIds.map(async (staffRecordId) => {
      try {
        const preview = await previewStaffTransfer(actingUser, toSingleInput(input, staffRecordId))
        return { staffRecordId, success: true as const, ...preview }
      } catch (error: any) {
        return { staffRecordId, success: false as const, error: error.message || 'Preview failed' }
      }
    })
  )

  return {
    results,
    successCount: results.filter((r) => r.success).length,
    failureCount: results.filter((r) => !r.success).length
  }
}

export async function executeBulkStaffTransfer(actingUser: ActingUser, input: BulkTransferInput) {
  // Sequential, not Promise.all — these are independent transactions, but
  // running them concurrently against the same destination-company lookups
  // (department/grade/designation reads) offers no real benefit here and
  // keeps the audit log's transferredAt ordering meaningful.
  const results: Array<{ staffRecordId: string; success: boolean; staffId?: string; staffName?: string; recordCounts?: Record<string, number>; transferId?: string; error?: string }> = []

  for (const staffRecordId of input.staffRecordIds) {
    try {
      const result = await executeStaffTransfer(actingUser, toSingleInput(input, staffRecordId))
      results.push({ staffRecordId, success: true, ...result })
    } catch (error: any) {
      results.push({ staffRecordId, success: false, error: error.message || 'Transfer failed' })
    }
  }

  return {
    results,
    successCount: results.filter((r) => r.success).length,
    failureCount: results.filter((r) => !r.success).length
  }
}
