// src/app/lib/payroll/payslip-duplicate-prefilter.ts
//
// Duplicate detection needs a staff member to have 2+ payslips inside the
// filter. Asking the database for exactly those staff first (one cheap
// GROUP BY ... HAVING count > 1 over the companyId/period index) means the
// expensive payslip + payroll + template + staff load only touches staff who can
// possibly have a duplicate, instead of every payslip for the company/period.
// The result is a strict superset of the true duplicates, so the grouping rules
// in payslip-duplicates.ts give identical answers.
import { prisma } from '@/app/lib/db'

export async function staffIdsWithMultiplePayslips(where: {
  companyId: string
  month?: string
  year?: number
}): Promise<string[]> {
  const groups = await prisma.payslip.groupBy({
    by: ['staffRecordId'],
    where,
    having: { staffRecordId: { _count: { gt: 1 } } },
  })
  return groups.map((g) => g.staffRecordId)
}
