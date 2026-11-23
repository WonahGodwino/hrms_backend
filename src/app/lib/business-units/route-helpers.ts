// Helpers shared by several routes (ARCH-002 / CODE-005: identical copies merged).
import { forCompany } from '@/app/lib/data/tenant'

export async function validStaffId(id: string | undefined | null, companyId: string): Promise<string | null> {
  const trimmed = (id || '').trim()
  if (!trimmed) return null
  const staff = await forCompany(companyId).staffRecord.findFirst({ where: { id: trimmed }, select: { id: true } })
  return staff ? staff.id : null
}
