// scripts/seed.ts
// @ts-nocheck
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

// Aiven-compatible PG pool with SSL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('\n🌱 Starting HRMS seed...\n')

  const createdBySeed = 'SYSTEM_SEED'

  // ────────────────────────────────────────────
  // 1. CREATE COMPANIES (Stable IDs)
  // ────────────────────────────────────────────
  const master = await prisma.company.upsert({
    where: { id: 'master-company' },
    update: {},
    create: {
      id: 'master-company',
      companyName: 'Master Company',
      address: 'Head Office',
      phone: '+2348000000000',
      email: 'master@company.com',
      createdBy: createdBySeed,
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
      createdBy: createdBySeed,
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
      createdBy: createdBySeed,
    },
  })

  // ────────────────────────────────────────────
  // 2. HASH PASSWORDS
  // ────────────────────────────────────────────
  const masterAdminRaw = 'SuperAdmin123!'
  const hrRaw = '0001A'
  const staffRaw = 'Staff123!'

  const masterAdminHash = await bcrypt.hash(masterAdminRaw, 10)
  const hrHash = await bcrypt.hash(hrRaw, 10)
  const staffHash = await bcrypt.hash(staffRaw, 10)

  // ────────────────────────────────────────────
  // 3. MASTER SUPER_ADMIN
  // Login:
  //    email: superadmin@master.com
  //    password: SuperAdmin123!
  // ────────────────────────────────────────────
  await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: 'superadmin@master.com',
        companyId: master.id,
      },
    },
    update: {
      role: 'SUPER_ADMIN',
      password: masterAdminHash,
      isRegistered: true,
      isActive: true,
      createdBy: createdBySeed,
    },
    create: {
      staffId: 'MASTER-SUPER-001',
      email: 'superadmin@master.com',
      firstName: 'Master',
      lastName: 'Admin',
      department: 'Administration',
      position: 'Super Administrator',
      phone: '+2348011111111',
      companyId: master.id,
      role: 'SUPER_ADMIN',
      password: masterAdminHash,
      isRegistered: true,
      isActive: true,
      createdBy: createdBySeed,
    },
  })

  // ────────────────────────────────────────────
  // 4. ACME HR (HR LOGIN)
  // Login:
  //    email: hr@company.com
  //    password: 0001A
  // ────────────────────────────────────────────
  await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: 'hr@company.com',
        companyId: acme.id,
      },
    },
    update: {
      role: 'HR',
      password: hrHash,
      isRegistered: true,
      isActive: true,
      department: 'Human Resources',
      position: 'HR Manager',
      createdBy: createdBySeed,
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
      password: hrHash,
      isRegistered: true,
      isActive: true,
      createdBy: createdBySeed,
    },
  })

  // ────────────────────────────────────────────
  // 5. ACME STAFF (EMPLOYEE LOGIN)
  // Login:
  //    email: staff1@acme.com
  //    password: Staff123!
  // ────────────────────────────────────────────
  await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: 'staff1@acme.com',
        companyId: acme.id,
      },
    },
    update: {
      role: 'STAFF',
      password: staffHash,
      isRegistered: true,
      isActive: true,
      department: 'Engineering',
      position: 'Software Engineer',
      createdBy: createdBySeed,
    },
    create: {
      staffId: 'ACME-STAFF-001',
      email: 'staff1@acme.com',
      firstName: 'John',
      lastName: 'Okafor',
      department: 'Engineering',
      position: 'Software Engineer',
      phone: '+2348044444444',
      companyId: acme.id,
      role: 'STAFF',
      password: staffHash,
      isRegistered: true,
      isActive: true,
      createdBy: createdBySeed,
    },
  })

  // ACME staff without login
  await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: 'staff2@acme.com',
        companyId: acme.id,
      },
    },
    update: {
      role: 'STAFF',
      isRegistered: false,
      isActive: true,
      department: 'Finance',
      position: 'Accountant',
      password: null,
      createdBy: createdBySeed,
    },
    create: {
      staffId: 'ACME-STAFF-002',
      email: 'staff2@acme.com',
      firstName: 'Sarah',
      lastName: 'Adebayo',
      department: 'Finance',
      position: 'Accountant',
      phone: '+2348055555555',
      companyId: acme.id,
      role: 'STAFF',
      password: null,
      isRegistered: false,
      isActive: true,
      createdBy: createdBySeed,
    },
  })

  // ────────────────────────────────────────────
  // 6. BETA HR (HR LOGIN)
  // Login:
  //    email: hr@beta.com
  //    password: 0001A
  // ────────────────────────────────────────────
  await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: 'hr@beta.com',
        companyId: beta.id,
      },
    },
    update: {
      role: 'HR',
      password: hrHash,
      isRegistered: true,
      isActive: true,
      department: 'Human Resources',
      position: 'HR Manager',
      createdBy: createdBySeed,
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
      password: hrHash,
      isRegistered: true,
      isActive: true,
      createdBy: createdBySeed,
    },
  })

  // ────────────────────────────────────────────
  // 7. BETA STAFF (EMPLOYEE LOGIN)
  // Login:
  //    email: staff1@beta.com
  //    password: Staff123!
  // ────────────────────────────────────────────
  await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: 'staff1@beta.com',
        companyId: beta.id,
      },
    },
    update: {
      role: 'STAFF',
      password: staffHash,
      isRegistered: true,
      isActive: true,
      department: 'Operations',
      position: 'Logistics Officer',
      createdBy: createdBySeed,
    },
    create: {
      staffId: 'BETA-STAFF-001',
      email: 'staff1@beta.com',
      firstName: 'Michael',
      lastName: 'Idris',
      department: 'Operations',
      position: 'Logistics Officer',
      phone: '+2348066666666',
      companyId: beta.id,
      role: 'STAFF',
      password: staffHash,
      isRegistered: true,
      isActive: true,
      createdBy: createdBySeed,
    },
  })

  // BETA staff without login
  await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: 'staff2@beta.com',
        companyId: beta.id,
      },
    },
    update: {
      role: 'STAFF',
      isRegistered: false,
      isActive: true,
      department: 'Warehouse',
      position: 'Store Keeper',
      password: null,
      createdBy: createdBySeed,
    },
    create: {
      staffId: 'BETA-STAFF-002',
      email: 'staff2@beta.com',
      firstName: 'Grace',
      lastName: 'Nwosu',
      department: 'Warehouse',
      position: 'Store Keeper',
      phone: '+2348077777777',
      companyId: beta.id,
      role: 'STAFF',
      password: null,
      isRegistered: false,
      isActive: true,
      createdBy: createdBySeed,
    },
  })

  console.log('✅ SEED COMPLETE!')
  console.log('\n🔐 Login Accounts:')
  console.log('---------------------------------------------')
  console.log('MASTER SUPER ADMIN:')
  console.log('  Email:    superadmin@master.com')
  console.log('  Password: SuperAdmin123!')
  console.log('---------------------------------------------')
  console.log('ACME HR:')
  console.log('  Email:    hr@company.com')
  console.log('  Password: 0001A')
  console.log('---------------------------------------------')
  console.log('ACME STAFF (login-enabled):')
  console.log('  Email:    staff1@acme.com')
  console.log('  Password: Staff123!')
  console.log('---------------------------------------------')
  console.log('BETA HR:')
  console.log('  Email:    hr@beta.com')
  console.log('  Password: 0001A')
  console.log('---------------------------------------------')
  console.log('BETA STAFF (login-enabled):')
  console.log('  Email:    staff1@beta.com')
  console.log('  Password: Staff123!')
  console.log('---------------------------------------------\n')
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:')
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
