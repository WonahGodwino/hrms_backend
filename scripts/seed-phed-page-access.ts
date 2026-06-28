// Seeds the default PHED Role-Based Payroll Access Matrix (Module 13, PRD
// 13.2) for a company. Idempotent — safe to re-run; only fills in missing
// (company, role, pageKey) rows.
//
// Usage:
//   npx tsx scripts/seed-phed-page-access.ts [companyId]

import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '@prisma/client'
import { seedDefaultPhedRoleAccessGrants, PHED_DEFAULT_ROLE_PAGE_KEYS } from '../src/app/lib/phed/page-access'

const companyId = process.argv[2] || 'acme-company'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log(`Seeding PHED page-access matrix for company "${companyId}"...\n`)

  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) {
    throw new Error(`Company "${companyId}" not found — pass a valid companyId as an argument.`)
  }

  const { created } = await seedDefaultPhedRoleAccessGrants(companyId)

  console.log(`Done. ${created} new grant row(s) created.\n`)
  console.table(
    Object.entries(PHED_DEFAULT_ROLE_PAGE_KEYS).map(([role, keys]) => ({
      role,
      pageKeys: keys.join(', '),
    })),
  )
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
