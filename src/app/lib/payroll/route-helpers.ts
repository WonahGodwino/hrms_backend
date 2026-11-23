// Helpers shared by several routes (ARCH-002 / CODE-005: identical copies merged).
import { forCompany } from '@/app/lib/data/tenant'

export async function verifyCompanyAccess(user: { userId: string; role: string }, companyId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true
  const userCompany = await forCompany(companyId).userCompany.findFirst({
    where: { userId: user.userId, OR: [{ role: user.role }, { role: 'ALL' }] }
  })
  return !!userCompany
}
