/**
 * prisma/seed.ts — FINAL VERSION (Prisma 7 + Multi-Company + No User Model)
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// Prisma 7 SAFE CLIENT + allow Aiven self-signed TLS
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding...')

  // 1) CREATE DEFAULT COMPANY (fixed ID)
  const DEFAULT_COMPANY_ID = 'COMPANY_DEFAULT_001'

  const company = await prisma.company.upsert({
    where: { id: DEFAULT_COMPANY_ID },
    update: {},
    create: {
      id: DEFAULT_COMPANY_ID,
      companyName: 'Company Name Ltd',
      address: 'Default Address',
      phone: '000-000-0000',
      email: 'admin@company.com',
      createdBy: 'SUPER_ADMIN_SYSTEM',
    },
  })

  // 2) SUPER ADMIN STAFF RECORD
  const superAdmin = await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: 'admin@company.com',
        companyId: company.id,
      },
    },
    update: {},
    create: {
      staffId: 'SA-0001',
      email: 'admin@company.com',
      firstName: 'System',
      lastName: 'Administrator',
      department: 'IT',
      position: 'SUPER_ADMIN',
      companyId: company.id,
      isActive: true,
    },
  })

  // 3) HR STAFF RECORD
  const hr = await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: 'hr@company.com',
        companyId: company.id,
      },
    },
    update: {},
    create: {
      staffId: 'HR-0001',
      email: 'hr@company.com',
      firstName: 'HR',
      lastName: 'Manager',
      department: 'Human Resources',
      position: 'HR',
      companyId: company.id,
      isActive: true,
    },
  })

  // 4) BACKFILL EXISTING DATA (RAW SQL ONLY)
  // This is only needed if you upgraded an old DB where companyId existed as NULL.
  // Prisma cannot filter NULL on required fields, so we do it with SQL.
  await prisma.$executeRawUnsafe(
    `UPDATE staff_records SET "companyId" = $1 WHERE "companyId" IS NULL`,
    company.id
  )
  await prisma.$executeRawUnsafe(
    `UPDATE payrolls SET "companyId" = $1 WHERE "companyId" IS NULL`,
    company.id
  )
  await prisma.$executeRawUnsafe(
    `UPDATE payslips SET "companyId" = $1 WHERE "companyId" IS NULL`,
    company.id
  )
  await prisma.$executeRawUnsafe(
    `UPDATE staff_uploads SET "companyId" = $1 WHERE "companyId" IS NULL`,
    company.id
  )
  await prisma.$executeRawUnsafe(
    `UPDATE payroll_uploads SET "companyId" = $1 WHERE "companyId" IS NULL`,
    company.id
  )

  console.log('Seed completed successfully.')
  console.log({
    companyId: company.id,
    superAdminStaffId: superAdmin.id,
    hrStaffId: hr.id,
  })
}

main()
  .catch((e) => {
    console.error('Seeding error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
