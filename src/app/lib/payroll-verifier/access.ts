// src/app/lib/payroll-verifier/access.ts
//
// Standalone company-access check for the Payroll Name Verifier module.
// requireModuleAccess only validates the caller's role + that the module is
// enabled for their own JWT-selected company — it does not check that an
// explicit companyId passed in a request body/form/query belongs to a
// multi-company HR/ADMIN user, so every route here also runs this check
// against that explicit companyId. Mirrors offer-letters/access.ts.
import { prisma } from '@/app/lib/db'
import type { AuthUser } from '@/app/lib/auth'

export async function validatePayrollVerifierCompanyAccess(user: AuthUser, companyId: string | null | undefined): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true
  if (!companyId) return false
  if (user.role === 'STAFF') return user.companyId === companyId

  const role = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : null
  if (!role) return false

  const membership = await prisma.userCompany.findFirst({
    where: { userId: user.userId, companyId, role: { in: [role, 'ALL'] } },
  })
  return !!membership
}
