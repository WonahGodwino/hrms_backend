// scripts/backfill-hr-company-access.ts
//
// HR/ADMIN staff must have a UserCompany link for their company — elevated
// access (leave approvals, admin lists, company scope) is resolved from it.
// Some were given the HR/ADMIN role without the link and so "see nothing".
// This creates the missing link for each such staff, matching the role→access
// sync now wired into the staff-edit and registration flows.
//
//   npx tsx --env-file=.env scripts/backfill-hr-company-access.ts          # dry run
//   npx tsx --env-file=.env scripts/backfill-hr-company-access.ts --apply  # write
import { prisma } from '../src/app/lib/db'

async function main() {
  const apply = process.argv.includes('--apply')

  const elevated = await prisma.staffRecord.findMany({
    where: { role: { in: ['HR', 'ADMIN'] }, isActive: true },
    select: { id: true, staffId: true, firstName: true, lastName: true, email: true, role: true, companyId: true },
  })

  const missing: typeof elevated = []
  for (const s of elevated) {
    const link = await prisma.userCompany.findUnique({
      where: { userId_companyId: { userId: s.id, companyId: s.companyId } },
    }).catch(() => null)
    if (!link) missing.push(s)
  }

  console.log(`${elevated.length} active HR/ADMIN staff, ${missing.length} missing a company-access link${apply ? '' : ' (dry run — pass --apply to write)'}`)
  for (const s of missing) {
    console.log(`  ${apply ? 'linking' : 'would link'} ${s.role} ${s.firstName} ${s.lastName} (${s.staffId || s.email}) -> company ${s.companyId}`)
    if (apply) {
      await prisma.userCompany.create({ data: { userId: s.id, companyId: s.companyId, role: s.role, createdBy: 'backfill-hr-company-access' } })
    }
  }
  console.log(apply ? `Done: ${missing.length} link(s) created.` : 'Dry run complete.')
}

main().catch((e) => { console.error(String(e).slice(0, 300)); process.exitCode = 1 }).finally(() => prisma.$disconnect())
