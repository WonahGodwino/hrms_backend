// Loads a PHED pay period only if it belongs to a company the caller can
// access (SEC-005). Returns null otherwise, so routes answer 404 for both a
// missing period and another tenant's period.
import { prisma } from '@/app/lib/db'
import type { AuthUser } from '@/app/lib/auth'
import { canAccessCompany } from '@/app/lib/access/company-access'

export async function findAccessiblePayPeriod(
  user: Pick<AuthUser, 'userId' | 'role' | 'companyId'>,
  payPeriodId: string,
) {
  const period = await prisma.phedPayPeriod.findUnique({ where: { id: payPeriodId } })
  if (!period || !(await canAccessCompany(user, period.companyId))) return null
  return period
}
