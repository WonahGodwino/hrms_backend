// src/app/lib/access/user-company-role.ts
//
// Keeps a staff member's company-access row (UserCompany) in sync with their
// role. HR/ADMIN need a UserCompany link to actually see and act on their
// company's data — leave approvals, admin lists, etc. all resolve access from
// UserCompany (see auth.ts: companyIds is built live from it). Without the
// link an "HR" staff can log in but sees nothing, which is the bug this fixes.
//
// Rule: role HR or ADMIN  -> ensure a link (role kept in sync);
//       any other role    -> remove the link for that company.
// Idempotent and safe to call on every role change. userId is the staff
// record id (UserCompany.userId references StaffRecord.id).
const ELEVATED = new Set(['HR', 'ADMIN'])

type UserCompanyDb = {
  userCompany: {
    upsert: (args: any) => Promise<unknown>
    deleteMany: (args: any) => Promise<unknown>
  }
}

export async function syncUserCompanyForRole(
  db: UserCompanyDb,
  args: { userId: string; companyId: string; role: string | null | undefined; actorEmail?: string | null }
): Promise<void> {
  const role = (args.role || '').toUpperCase()
  if (!args.userId || !args.companyId) return

  if (ELEVATED.has(role)) {
    await db.userCompany.upsert({
      where: { userId_companyId: { userId: args.userId, companyId: args.companyId } },
      update: { role, updatedBy: args.actorEmail ?? undefined },
      create: { userId: args.userId, companyId: args.companyId, role, createdBy: args.actorEmail ?? undefined },
    })
  } else {
    // Demoted (or never elevated): drop the company-access link so they don't
    // retain HR/ADMIN visibility. Scoped to this company only — cross-company
    // grants on other companies are untouched.
    await db.userCompany.deleteMany({ where: { userId: args.userId, companyId: args.companyId } })
  }
}
