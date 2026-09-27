// Shared PHED staff permanent-deletion logic used by the single and bulk
// permanent-delete endpoints. Deletes related records in dependency order,
// then the login account, and finally the PHED staff record itself.

import { prisma } from '@/app/lib/db'

export async function deletePhedStaffRecord(staffId: string): Promise<void> {
  await (prisma as any).phedStaffCooperative.deleteMany({ where: { staffId } }).catch(() => {})
  await (prisma as any).phedStaffUnion.deleteMany({ where: { staffId } }).catch(() => {})
  await (prisma as any).phedValidation.deleteMany({ where: { staffId } }).catch(() => {})
  await (prisma as any).phedOvertimeEntry.deleteMany({ where: { staffId } }).catch(() => {})
  await (prisma as any).phedStaffPeriodAdvance.deleteMany({ where: { staffId } }).catch(() => {})
  await (prisma as any).phedStaffDeductionLiability.deleteMany({ where: { staffId } }).catch(() => {})
  await (prisma as any).phedComputedPayroll.deleteMany({ where: { staffId } }).catch(() => {})

  const staff = await (prisma as any).phedStaff.findUnique({
    where: { id: staffId },
    select: { staffId: true, companyId: true },
  })
  if (staff) {
    await prisma.staffRecord.deleteMany({
      where: { staffId: staff.staffId, companyId: staff.companyId },
    }).catch(() => {})
  }

  await (prisma as any).phedStaff.delete({ where: { id: staffId } })
}
