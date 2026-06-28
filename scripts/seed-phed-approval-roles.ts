// Seeds the 8 PHED Payroll Approval Workflow / Access Matrix roles
// (Module 12 & 13) as brand-new, login-capable accounts.
//
// These roles are independent of StaffRecord.role and are NOT assignable
// to existing staff — this script is the only way to create them for now.
// Safe to re-run: existing accounts/grants are left untouched, only
// missing ones are created.
//
// Usage:
//   npx tsx scripts/seed-phed-approval-roles.ts [companyId]

import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient, PhedAccessRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

// Default: the only company with PHED test data in this environment.
const companyId = process.argv[2] || 'acme-company'
const createdBy = 'SYSTEM_SEED'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

interface SeedRoleAccount {
  accessRole: PhedAccessRole
  staffId: string
  email: string
  firstName: string
  lastName: string
  position: string
}

const ROLE_ACCOUNTS: SeedRoleAccount[] = [
  {
    accessRole: 'MANAGER_COMP_BENEFITS',
    staffId: 'PHED-APR-MGRCB',
    email: 'manager.compbenefits@phed-approvals.local',
    firstName: 'Manager',
    lastName: 'Compensation Benefits',
    position: 'Manager, Compensation & Benefits',
  },
  {
    accessRole: 'HEAD_INTERNAL_AUDIT',
    staffId: 'PHED-APR-HIAD',
    email: 'head.internalaudit@phed-approvals.local',
    firstName: 'Head',
    lastName: 'Internal Audit',
    position: 'Head, Internal Audit',
  },
  {
    accessRole: 'CHIEF_PEOPLE_OFFICER',
    staffId: 'PHED-APR-CPO',
    email: 'cpo@phed-approvals.local',
    firstName: 'Chief People',
    lastName: 'Officer',
    position: 'Chief People Officer',
  },
  {
    accessRole: 'CHIEF_FINANCE_OFFICER',
    staffId: 'PHED-APR-CFO',
    email: 'cfo@phed-approvals.local',
    firstName: 'Chief Finance',
    lastName: 'Officer',
    position: 'Chief Finance Officer',
  },
  {
    accessRole: 'MD_CEO',
    staffId: 'PHED-APR-MDCEO',
    email: 'mdceo@phed-approvals.local',
    firstName: 'MD',
    lastName: 'CEO',
    position: 'MD/CEO',
  },
  {
    accessRole: 'TREASURY_TEAM',
    staffId: 'PHED-APR-TREAS',
    email: 'treasury@phed-approvals.local',
    firstName: 'Treasury',
    lastName: 'Team',
    position: 'Treasury Team',
  },
  {
    accessRole: 'FINANCIAL_REPORTING_TEAM',
    staffId: 'PHED-APR-FINREP',
    email: 'financialreporting@phed-approvals.local',
    firstName: 'Financial Reporting',
    lastName: 'Team',
    position: 'Financial Reporting Team',
  },
  {
    accessRole: 'TAX_TEAM',
    staffId: 'PHED-APR-TAX',
    email: 'tax@phed-approvals.local',
    firstName: 'Tax',
    lastName: 'Team',
    position: 'Tax Team',
  },
]

// Mirrors the existing PHED staff-onboarding temp-password convention
// ({firstName}{lastName}, lowercased), sanitized for names containing
// punctuation (e.g. none here today, but kept defensive).
function tempPassword(firstName: string, lastName: string) {
  return `${firstName}${lastName}`.toLowerCase().replace(/[^a-z0-9]/g, '')
}

async function main() {
  console.log(`Seeding PHED approval roles for company "${companyId}"...\n`)

  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) {
    throw new Error(`Company "${companyId}" not found — pass a valid companyId as an argument.`)
  }

  const credentials: { role: string; email: string; password: string; created: boolean }[] = []

  for (const account of ROLE_ACCOUNTS) {
    const plainPassword = tempPassword(account.firstName, account.lastName)
    const hashed = await bcrypt.hash(plainPassword, 10)

    const existing = await prisma.staffRecord.findUnique({
      where: { email_companyId: { email: account.email, companyId } },
    })

    const staff = await prisma.staffRecord.upsert({
      where: { email_companyId: { email: account.email, companyId } },
      update: {},
      create: {
        staffId: account.staffId,
        email: account.email,
        firstName: account.firstName,
        lastName: account.lastName,
        position: account.position,
        companyId,
        role: 'STAFF',
        password: hashed,
        isRegistered: true,
        isActive: true,
        requirePasswordChange: true,
        createdBy,
      },
    })

    await prisma.phedStaffAccessRole.upsert({
      where: { staffRecordId: staff.id },
      update: { accessRole: account.accessRole },
      create: {
        companyId,
        staffRecordId: staff.id,
        accessRole: account.accessRole,
      },
    })

    credentials.push({
      role: account.accessRole,
      email: account.email,
      password: existing ? '(unchanged — account already existed)' : plainPassword,
      created: !existing,
    })
  }

  console.log('Done. Accounts:\n')
  console.table(credentials)
  console.log('\nTemp passwords are only shown for newly-created accounts above.')
  console.log('Each account has requirePasswordChange=true and must change it on first login.')
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
