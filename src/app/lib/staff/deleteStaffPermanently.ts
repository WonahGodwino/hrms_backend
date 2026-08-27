// src/app/lib/staff/deleteStaffPermanently.ts
//
// Genuinely, irreversibly deletes a StaffRecord — unlike the "Archive"
// action elsewhere (backend/src/app/api/admin/staff/edit/[id]/route.ts and
// .../bulk/delete/route.ts), which only ever flips isActive to false. Only
// usable on staff who are already archived (isActive: false).
//
// StaffRecord has ~24 onDelete: Cascade relations, so a raw
// prisma.staffRecord.delete() wipes attendance, leave, notifications, loans,
// benefits, training/certification records, salary/grade history,
// department-staff history, offboarding, UserCompany, payroll, payslips, and
// the tax profile in one go. Per product decision, Payroll/Payslip/
// EmployeeTaxProfile figures are preserved as a JSON snapshot in
// StaffDeletionRecord before the cascade destroys the live rows.
//
// PHED is never touched: if the staff has any row in PhedStaffAccessRole or
// the PHED "Pay Period Workflow" tables (EmployeeSalary, PayValidation,
// OvertimeEntry, DeductionEntry, ComputedPayslip — plain names, but
// exclusively PHED data per backend/src/app/api/phed/pay-periods/**), the
// delete is blocked outright rather than letting cascade reach into PHED.
//
// TrainingAuditLog.actorId and BenefitAllocation.allocatedBy are required
// relations that would otherwise block the delete with a raw FK violation
// (this staff acting on someone ELSE's log entry / allocation, not their own
// record) — both columns were made nullable specifically so these can be
// cleared first, preserving the logged action/allocation itself.
import { prisma } from '@/app/lib/db'

export type ActingUser = { userId: string; role: string }

export class DeletionValidationError extends Error {}

export async function permanentlyDeleteStaff(actingUser: ActingUser, staffRecordId: string, reason?: string | null) {
  if (!['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
    throw new DeletionValidationError('Only ADMIN or SUPER_ADMIN can permanently delete a staff record')
  }

  const staff = await prisma.staffRecord.findUnique({ where: { id: staffRecordId } })
  if (!staff) throw new DeletionValidationError('Staff record not found')
  if (staff.isActive) {
    throw new DeletionValidationError('Archive this staff member before permanently deleting them')
  }

  const [phedAccessRoleCount, employeeSalaryCount, payValidationCount, overtimeEntryCount, deductionEntryCount, computedPayslipCount] = await Promise.all([
    (prisma as any).phedStaffAccessRole.count({ where: { staffRecordId: staff.id } }),
    (prisma as any).employeeSalary.count({ where: { staffId: staff.id } }),
    (prisma as any).payValidation.count({ where: { staffId: staff.id } }),
    (prisma as any).overtimeEntry.count({ where: { staffId: staff.id } }),
    (prisma as any).deductionEntry.count({ where: { staffId: staff.id } }),
    (prisma as any).computedPayslip.count({ where: { staffId: staff.id } })
  ])
  const phedRecordCount = phedAccessRoleCount + employeeSalaryCount + payValidationCount + overtimeEntryCount + deductionEntryCount + computedPayslipCount
  if (phedRecordCount > 0) {
    throw new DeletionValidationError(
      'This staff member has Payroll Engine (PHED module) records and cannot be permanently deleted. Remove those records via the Payroll Engine module first.'
    )
  }

  const [payrollRecords, payslipRecords, taxProfile] = await Promise.all([
    prisma.payroll.findMany({ where: { staffRecordId: staff.id } }),
    prisma.payslip.findMany({
      where: { staffRecordId: staff.id },
      select: { id: true, month: true, year: true, grossPay: true, netPay: true, fileName: true, draft: true, createdAt: true }
    }),
    prisma.employeeTaxProfile.findUnique({ where: { staffId: staff.id } })
  ])

  const preservedData = {
    payroll: payrollRecords,
    payslips: payslipRecords,
    taxProfile
  }

  const transferRecord = await prisma.$transaction(
    async (tx) => {
      await tx.trainingAuditLog.updateMany({ where: { actorId: staff.id }, data: { actorId: null } })
      await tx.benefitAllocation.updateMany({ where: { allocatedBy: staff.id }, data: { allocatedBy: null } })

      const deletionRecord = await tx.staffDeletionRecord.create({
        data: {
          staffRecordId: staff.id,
          companyId: staff.companyId,
          staffId: staff.staffId,
          fullName: `${staff.firstName} ${staff.lastName}`,
          email: staff.email,
          deletedBy: actingUser.userId,
          reason: reason ?? null,
          preservedData
        }
      })

      await tx.staffRecord.delete({ where: { id: staff.id } })

      return deletionRecord
    },
    { timeout: 20000, maxWait: 10000 }
  )

  return {
    staffId: staff.staffId,
    staffName: `${staff.firstName} ${staff.lastName}`,
    deletionRecordId: transferRecord.id,
    preservedRecordCounts: {
      payroll: payrollRecords.length,
      payslips: payslipRecords.length,
      taxProfile: taxProfile ? 1 : 0
    }
  }
}
