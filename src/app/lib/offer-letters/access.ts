// src/app/lib/offer-letters/access.ts
//
// Standalone company-access check for the Offer Letter module. requireModuleAccess
// only validates the caller's role + that the module is enabled for their own
// JWT-selected company — it does not check that an explicit companyId passed
// in a request body/query belongs to a multi-company HR/ADMIN user, so every
// route here also runs this check against that explicit companyId.
import { prisma } from '@/app/lib/db'
import type { AuthUser } from '@/app/lib/auth'

export async function validateOfferLetterCompanyAccess(user: AuthUser, companyId: string | null | undefined): Promise<boolean> {
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
