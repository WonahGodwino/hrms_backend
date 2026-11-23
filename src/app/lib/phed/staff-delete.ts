// Shared PHED staff permanent-deletion logic used by the single and bulk
// permanent-delete endpoints. Deletes related records in dependency order,
// then the login account, and finally the PHED staff record itself.

import { prisma } from '@/app/lib/db'

export async function deletePhedStaffRecord(staffId: string): Promise<void> {
  await prisma.phedStaffCooperative.deleteMany({ where: { staffId } }).catch(() => {})
  await prisma.phedStaffUnion.deleteMany({ where: { staffId } }).catch(() => {})
  await prisma.phedValidation.deleteMany({ where: { staffId } }).catch(() => {})
  await prisma.phedOvertimeEntry.deleteMany({ where: { staffId } }).catch(() => {})
  await prisma.phedStaffPeriodAdvance.deleteMany({ where: { staffId } }).catch(() => {})
  await prisma.phedStaffDeductionLiability.deleteMany({ where: { staffId } }).catch(() => {})
  await prisma.phedComputedPayroll.deleteMany({ where: { staffId } }).catch(() => {})

  const staff = await prisma.phedStaff.findUnique({
    where: { id: staffId },
    select: { staffId: true, companyId: true },
  })
  if (staff) {
    await prisma.staffRecord.deleteMany({
      where: { staffId: staff.staffId, companyId: staff.companyId },
    }).catch(() => {})
  }

  await prisma.phedStaff.delete({ where: { id: staffId } })
}
