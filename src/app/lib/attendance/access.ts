// src/app/lib/attendance/access.ts
//
// One company-access rule for every attendance endpoint, so the company
// switcher scopes the whole module consistently:
//
//   - SUPER_ADMIN: every company, view and act (record, export, settings,
//                  holidays) — they pick it in the company switcher, which
//                  lists all companies for them, exactly like Staff
//                  Management. The module check is skipped for them too.
//   - HR / ADMIN:  any company they're assigned to (a UserCompany row — the
//                  same set the company switcher shows), plus their own
//                  token company.
//   - STAFF / MANAGER: only their own company.
//   - And the Attendance module must be enabled for THAT company —
//     requireModuleAccess() only checks the token's company, which doesn't
//     change when the user switches company.
import { prisma } from '@/app/lib/db'
import { hasModuleAccess } from '@/app/lib/module-access'

type Caller = { userId: string; role: string; companyId?: string | null }

async function isMember(user: Caller, companyId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true
  if (user.companyId === companyId) return true
  if (user.role !== 'HR' && user.role !== 'ADMIN') return false
  // Same rule as the company switcher (api/companies/accessible): any
  // assignment row grants access — its `role` column is a point-in-time
  // snapshot that can drift after a promotion/demotion, so it isn't
  // re-checked. A company in the switcher is always openable here.
  const link = await prisma.userCompany.findFirst({
    where: { userId: user.userId, companyId },
    select: { id: true },
  })
  return !!link
}

// null when allowed, otherwise a user-facing reason (send as 403).
export async function attendanceAccessError(user: Caller, companyId: string | null | undefined): Promise<string | null> {
  if (!companyId) return 'Company ID is required'
  if (!(await isMember(user, companyId))) return 'You do not have access to this company'
  if (user.role !== 'SUPER_ADMIN' && !(await hasModuleAccess(companyId, 'ATTENDANCE'))) {
    return 'The Attendance module is not enabled for this company'
  }
  return null
}

export async function canManageAttendance(user: Caller, companyId: string): Promise<boolean> {
  return (await attendanceAccessError(user, companyId)) === null
}
