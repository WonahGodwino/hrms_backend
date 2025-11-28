// scripts/seed.ts
// @ts-nocheck
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

// Basic PG pool – you can mirror whatever SSL config you use in db.ts
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
})

const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Seeding HRMS multi-company database...')

  const createdBy = 'SYSTEM_SEED' // just a marker; string in your schema

  // ─────────────────────────────────────
  // 1. Seed companies (ids are fixed so upsert is stable)
  // ─────────────────────────────────────
  const master = await prisma.company.upsert({
    where: { id: 'master-company' },
    update: {},
    create: {
      id: 'master-company',
      companyName: 'Master Company',
      address: 'Head Office',
      phone: '+2348000000000',
      email: 'master@company.com',
      createdBy,
    },
  })

  const acme = await prisma.company.upsert({
    where: { id: 'acme-company' },
    update: {},
    create: {
      id: 'acme-company',
      companyName: 'Acme HR Solutions',
      address: 'Lagos',
      phone: '+2348012345678',
      email: 'info@acme.com',
      createdBy,
    },
  })

  const beta = await prisma.company.upsert({
    where: { id: 'beta-company' },
    update: {},
    create: {
      id: 'beta-company',
      companyName: 'Beta Logistics',
      address: 'Abuja',
      phone: '+2348098765432',
      email: 'info@beta.com',
      createdBy,
    },
  })

  // ─────────────────────────────────────
  // 2. Hash passwords for seeded users
  // ─────────────────────────────────────
  const superAdminPasswordHash = await bcrypt.hash('SuperAdmin123!', 10)
  const hrPasswordHash = await bcrypt.hash('0001A', 10)

  // ─────────────────────────────────────
  // 3. Seed MASTER SUPER_ADMIN
  //    Login: email = superadmin@master.com, password = SuperAdmin123!
  // ─────────────────────────────────────
  await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: 'superadmin@master.com',
        companyId: master.id,
      },
    },
    update: {
      // if already exists, ensure it stays a valid SUPER_ADMIN
      role: 'SUPER_ADMIN',
      password: superAdminPasswordHash,
      isRegistered: true,
      isActive: true,
    },
    create: {
      staffId: 'MASTER-SUPER-001',
      email: 'superadmin@master.com',
      firstName: 'Master',
      lastName: 'Admin',
      department: 'Administration',
      position: 'Super Admin',
      phone: '+2348011111111',
      companyId: master.id,
      role: 'SUPER_ADMIN',
      password: superAdminPasswordHash,
      isRegistered: true,
      isActive: true,
    },
  })

  // ─────────────────────────────────────
  // 4. Seed ACME HR
  //    Login: email = hr@company.com, password = 0001A
  // ─────────────────────────────────────
  await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: 'hr@company.com',
        companyId: acme.id,
      },
    },
    update: {
      role: 'HR',
      password: hrPasswordHash,
      isRegistered: true,
      isActive: true,
      department: 'Human Resources',
      position: 'HR Manager',
    },
    create: {
      staffId: 'ACME-HR-001',
      email: 'hr@company.com',
      firstName: 'Acme',
      lastName: 'HR',
      department: 'Human Resources',
      position: 'HR Manager',
      phone: '+2348022222222',
      companyId: acme.id,
      role: 'HR',
      password: hrPasswordHash,
      isRegistered: true,
      isActive: true,
    },
  })

  // ─────────────────────────────────────
  // 5. Seed BETA HR (optional extra admin)
  //    Login: email = hr@beta.com, password = 0001A
  // ─────────────────────────────────────
  await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: 'hr@beta.com',
        companyId: beta.id,
      },
    },
    update: {
      role: 'HR',
      password: hrPasswordHash,
      isRegistered: true,
      isActive: true,
      department: 'Human Resources',
      position: 'HR Manager',
    },
    create: {
      staffId: 'BETA-HR-001',
      email: 'hr@beta.com',
      firstName: 'Beta',
      lastName: 'HR',
      department: 'Human Resources',
      position: 'HR Manager',
      phone: '+2348033333333',
      companyId: beta.id,
      role: 'HR',
      password: hrPasswordHash,
      isRegistered: true,
      isActive: true,
    },
  })

  console.log('✅ Seeding completed.')
}

main()
  .catch((err) => {
    console.error('❌ Seeding failed:')
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
