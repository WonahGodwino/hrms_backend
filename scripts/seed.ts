// scripts/seed.ts
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

// Load environment variables from .env.production if available
// Otherwise fall back to .env
const loadEnv = () => {
  try {
    require('dotenv').config({ path: '.env.production' })
  } catch {
    // Fallback to default .env
    require('dotenv').config()
  }
}
loadEnv()

// Aiven-compatible PG pool with SSL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// Configuration from environment variables
const config = {
  // Master SUPER_ADMIN
  masterAdminEmail: process.env.SUPER_ADMIN_EMAIL || 'superadmin@master.com',
  masterAdminPassword: process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!',
  masterAdminName: process.env.SUPER_ADMIN_NAME || 'Master Admin',
  masterAdminPhone: process.env.SUPER_ADMIN_PHONE || '+2348011111111',
  
  // HR User Defaults
  hrPassword: process.env.HR_DEFAULT_PASSWORD || '0001A',
  hrDefaultName: process.env.HR_DEFAULT_NAME || 'HR Manager',
  hrDefaultPhone: process.env.HR_DEFAULT_PHONE || '+2348022222222',
  
  // Staff User Defaults
  staffPassword: process.env.STAFF_DEFAULT_PASSWORD || 'Staff123!',
  staffDefaultPhone: process.env.STAFF_DEFAULT_PHONE || '+2348044444444',
  
  // Company Configuration
  masterCompanyName: process.env.MASTER_COMPANY_NAME || 'Master Company',
  masterCompanyEmail: process.env.MASTER_COMPANY_EMAIL || 'master@company.com',
  masterCompanyPhone: process.env.MASTER_COMPANY_PHONE || '+2348000000000',
  
  acmeCompanyName: process.env.ACME_COMPANY_NAME || 'Acme HR Solutions',
  acmeCompanyEmail: process.env.ACME_COMPANY_EMAIL || 'info@acme.com',
  acmeCompanyPhone: process.env.ACME_COMPANY_PHONE || '+2348012345678',
  
  betaCompanyName: process.env.BETA_COMPANY_NAME || 'Beta Logistics',
  betaCompanyEmail: process.env.BETA_COMPANY_EMAIL || 'info@beta.com',
  betaCompanyPhone: process.env.BETA_COMPANY_PHONE || '+2348098765432',
  
  // Seed Configuration
  createdBySeed: process.env.SEED_CREATED_BY || 'SYSTEM_SEED',
  
  // Security Settings
  passwordHashRounds: parseInt(process.env.PASSWORD_HASH_ROUNDS || '10', 10),
  
  // Feature Flags
  createSampleJobs: process.env.CREATE_SAMPLE_JOBS === 'true',
  createSampleApplications: process.env.CREATE_SAMPLE_APPLICATIONS === 'true',
  createAISettings: process.env.CREATE_AI_SETTINGS !== 'false', // Default true
}

async function main() {
  console.log('\n🌱 Starting HRMS seed...\n')
  console.log('📋 Configuration:')
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`  Database: ${process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'unknown'}`)
  console.log(`  Password Hash Rounds: ${config.passwordHashRounds}`)
  console.log()

  // ────────────────────────────────────────────
  // 1. CREATE COMPANIES (Stable IDs)
  // ────────────────────────────────────────────
  console.log('📁 Creating companies...')
  
  const master = await prisma.company.upsert({
    where: { id: 'master-company' },
    update: {},
    create: {
      id: 'master-company',
      companyName: config.masterCompanyName,
      address: process.env.MASTER_COMPANY_ADDRESS || 'Head Office',
      phone: config.masterCompanyPhone,
      email: config.masterCompanyEmail,
      //logo: process.env.MASTER_COMPANY_LOGO || null,
      //taxId: process.env.MASTER_COMPANY_TAX_ID || null,
      createdBy: config.createdBySeed,
    },
  })
  console.log(`  ✅ ${master.companyName}`)

  const acme = await prisma.company.upsert({
    where: { id: 'acme-company' },
    update: {},
    create: {
      id: 'acme-company',
      companyName: config.acmeCompanyName,
      address: process.env.ACME_COMPANY_ADDRESS || 'Lagos',
      phone: config.acmeCompanyPhone,
      email: config.acmeCompanyEmail,
      //logo: process.env.ACME_COMPANY_LOGO || null,
      //taxId: process.env.ACME_COMPANY_TAX_ID || null,
      createdBy: config.createdBySeed,
    },
  })
  console.log(`  ✅ ${acme.companyName}`)

  const beta = await prisma.company.upsert({
    where: { id: 'beta-company' },
    update: {},
    create: {
      id: 'beta-company',
      companyName: config.betaCompanyName,
      address: process.env.BETA_COMPANY_ADDRESS || 'Abuja',
      phone: config.betaCompanyPhone,
      email: config.betaCompanyEmail,
      //logo: process.env.BETA_COMPANY_LOGO || null,
      //taxId: process.env.BETA_COMPANY_TAX_ID || null,
      createdBy: config.createdBySeed,
    },
  })
  console.log(`  ✅ ${beta.companyName}`)

  // ────────────────────────────────────────────
  // 2. HASH PASSWORDS
  // ────────────────────────────────────────────
  console.log('\n🔐 Hashing passwords...')
  
  const masterAdminHash = await bcrypt.hash(config.masterAdminPassword, config.passwordHashRounds)
  const hrHash = await bcrypt.hash(config.hrPassword, config.passwordHashRounds)
  const staffHash = await bcrypt.hash(config.staffPassword, config.passwordHashRounds)

  // ────────────────────────────────────────────
  // 3. MASTER SUPER_ADMIN
  // ────────────────────────────────────────────
  console.log('\n👤 Creating SUPER_ADMIN...')
  
  await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: config.masterAdminEmail,
        companyId: master.id,
      },
    },
    update: {
      role: 'SUPER_ADMIN',
      password: masterAdminHash,
      isRegistered: true,
      isActive: true,
      createdBy: config.createdBySeed,
    },
    create: {
      staffId: process.env.SUPER_ADMIN_STAFF_ID || 'MASTER-SUPER-001',
      email: config.masterAdminEmail,
      firstName: process.env.SUPER_ADMIN_FIRST_NAME || 'Master',
      lastName: process.env.SUPER_ADMIN_LAST_NAME || 'Admin',
      department: process.env.SUPER_ADMIN_DEPARTMENT || 'Administration',
      position: process.env.SUPER_ADMIN_POSITION || 'Super Administrator',
      phone: config.masterAdminPhone,
      companyId: master.id,
      role: 'SUPER_ADMIN',
      password: masterAdminHash,
      isRegistered: true,
      isActive: true,
      createdBy: config.createdBySeed,
    },
  })
  console.log(`  ✅ ${config.masterAdminEmail}`)

  // ────────────────────────────────────────────
  // 4. ACME HR (HR LOGIN)
  // ────────────────────────────────────────────
  console.log('\n👤 Creating ACME HR...')
  
  await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: process.env.ACME_HR_EMAIL || 'hr@company.com',
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
      createdBy: config.createdBySeed,
    },
    create: {
      staffId: process.env.ACME_HR_STAFF_ID || 'ACME-HR-001',
      email: process.env.ACME_HR_EMAIL || 'hr@company.com',
      firstName: process.env.ACME_HR_FIRST_NAME || 'Acme',
      lastName: process.env.ACME_HR_LAST_NAME || 'HR',
      department: process.env.ACME_HR_DEPARTMENT || 'Human Resources',
      position: process.env.ACME_HR_POSITION || 'HR Manager',
      phone: config.hrDefaultPhone,
      companyId: acme.id,
      role: 'HR',
      password: hrHash,
      isRegistered: true,
      isActive: true,
      createdBy: config.createdBySeed,
    },
  })
  console.log(`  ✅ ${process.env.ACME_HR_EMAIL || 'hr@company.com'}`)

  // ────────────────────────────────────────────
  // 5. ACME STAFF (EMPLOYEE LOGIN)
  // ────────────────────────────────────────────
  console.log('\n👤 Creating ACME Staff...')
  
  await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: process.env.ACME_STAFF1_EMAIL || 'staff1@acme.com',
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
      createdBy: config.createdBySeed,
    },
    create: {
      staffId: process.env.ACME_STAFF1_STAFF_ID || 'ACME-STAFF-001',
      email: process.env.ACME_STAFF1_EMAIL || 'staff1@acme.com',
      firstName: process.env.ACME_STAFF1_FIRST_NAME || 'John',
      lastName: process.env.ACME_STAFF1_LAST_NAME || 'Okafor',
      department: process.env.ACME_STAFF1_DEPARTMENT || 'Engineering',
      position: process.env.ACME_STAFF1_POSITION || 'Software Engineer',
      phone: config.staffDefaultPhone,
      companyId: acme.id,
      role: 'STAFF',
      password: staffHash,
      isRegistered: true,
      isActive: true,
      createdBy: config.createdBySeed,
    },
  })
  console.log(`  ✅ ${process.env.ACME_STAFF1_EMAIL || 'staff1@acme.com'}`)

  // ACME staff without login
  await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: process.env.ACME_STAFF2_EMAIL || 'staff2@acme.com',
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
      createdBy: config.createdBySeed,
    },
    create: {
      staffId: process.env.ACME_STAFF2_STAFF_ID || 'ACME-STAFF-002',
      email: process.env.ACME_STAFF2_EMAIL || 'staff2@acme.com',
      firstName: process.env.ACME_STAFF2_FIRST_NAME || 'Sarah',
      lastName: process.env.ACME_STAFF2_LAST_NAME || 'Adebayo',
      department: process.env.ACME_STAFF2_DEPARTMENT || 'Finance',
      position: process.env.ACME_STAFF2_POSITION || 'Accountant',
      phone: process.env.ACME_STAFF2_PHONE || '+2348055555555',
      companyId: acme.id,
      role: 'STAFF',
      password: null,
      isRegistered: false,
      isActive: true,
      createdBy: config.createdBySeed,
    },
  })
  console.log(`  ✅ ${process.env.ACME_STAFF2_EMAIL || 'staff2@acme.com'} (no login)`)

  // ────────────────────────────────────────────
  // 6. BETA HR (HR LOGIN)
  // ────────────────────────────────────────────
  console.log('\n👤 Creating BETA HR...')
  
  await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: process.env.BETA_HR_EMAIL || 'hr@beta.com',
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
      createdBy: config.createdBySeed,
    },
    create: {
      staffId: process.env.BETA_HR_STAFF_ID || 'BETA-HR-001',
      email: process.env.BETA_HR_EMAIL || 'hr@beta.com',
      firstName: process.env.BETA_HR_FIRST_NAME || 'Beta',
      lastName: process.env.BETA_HR_LAST_NAME || 'HR',
      department: process.env.BETA_HR_DEPARTMENT || 'Human Resources',
      position: process.env.BETA_HR_POSITION || 'HR Manager',
      phone: process.env.BETA_HR_PHONE || '+2348033333333',
      companyId: beta.id,
      role: 'HR',
      password: hrHash,
      isRegistered: true,
      isActive: true,
      createdBy: config.createdBySeed,
    },
  })
  console.log(`  ✅ ${process.env.BETA_HR_EMAIL || 'hr@beta.com'}`)

  // ────────────────────────────────────────────
  // 7. BETA STAFF (EMPLOYEE LOGIN)
  // ────────────────────────────────────────────
  console.log('\n👤 Creating BETA Staff...')
  
  await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: process.env.BETA_STAFF1_EMAIL || 'staff1@beta.com',
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
      createdBy: config.createdBySeed,
    },
    create: {
      staffId: process.env.BETA_STAFF1_STAFF_ID || 'BETA-STAFF-001',
      email: process.env.BETA_STAFF1_EMAIL || 'staff1@beta.com',
      firstName: process.env.BETA_STAFF1_FIRST_NAME || 'Michael',
      lastName: process.env.BETA_STAFF1_LAST_NAME || 'Idris',
      department: process.env.BETA_STAFF1_DEPARTMENT || 'Operations',
      position: process.env.BETA_STAFF1_POSITION || 'Logistics Officer',
      phone: process.env.BETA_STAFF1_PHONE || '+2348066666666',
      companyId: beta.id,
      role: 'STAFF',
      password: staffHash,
      isRegistered: true,
      isActive: true,
      createdBy: config.createdBySeed,
    },
  })
  console.log(`  ✅ ${process.env.BETA_STAFF1_EMAIL || 'staff1@beta.com'}`)

  // BETA staff without login
  await prisma.staffRecord.upsert({
    where: {
      email_companyId: {
        email: process.env.BETA_STAFF2_EMAIL || 'staff2@beta.com',
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
      createdBy: config.createdBySeed,
    },
    create: {
      staffId: process.env.BETA_STAFF2_STAFF_ID || 'BETA-STAFF-002',
      email: process.env.BETA_STAFF2_EMAIL || 'staff2@beta.com',
      firstName: process.env.BETA_STAFF2_FIRST_NAME || 'Grace',
      lastName: process.env.BETA_STAFF2_LAST_NAME || 'Nwosu',
      department: process.env.BETA_STAFF2_DEPARTMENT || 'Warehouse',
      position: process.env.BETA_STAFF2_POSITION || 'Store Keeper',
      phone: process.env.BETA_STAFF2_PHONE || '+2348077777777',
      companyId: beta.id,
      role: 'STAFF',
      password: null,
      isRegistered: false,
      isActive: true,
      createdBy: config.createdBySeed,
    },
  })
  console.log(`  ✅ ${process.env.BETA_STAFF2_EMAIL || 'staff2@beta.com'} (no login)`)

  // ────────────────────────────────────────────
  // 8. CREATE USER COMPANY ASSIGNMENTS
  // ────────────────────────────────────────────
  console.log('\n🏢 Creating company assignments...')
  
  // Get all created users
  const users = await prisma.staffRecord.findMany({
    where: {
      email: {
        in: [
          config.masterAdminEmail,
          process.env.ACME_HR_EMAIL || 'hr@company.com',
          process.env.BETA_HR_EMAIL || 'hr@beta.com',
        ]
      }
    }
  })

  for (const user of users) {
    let targetCompanyId: string
    let role: string
    
    if (user.email === config.masterAdminEmail) {
      targetCompanyId = master.id
      role = 'SUPER_ADMIN'
    } else if (user.email === (process.env.ACME_HR_EMAIL || 'hr@company.com')) {
      targetCompanyId = acme.id
      role = 'HR'
    } else {
      targetCompanyId = beta.id
      role = 'HR'
    }

    await prisma.userCompany.upsert({
      where: {
        userId_companyId: {
          userId: user.id,
          companyId: targetCompanyId
        }
      },
      update: {
        role,
        updatedBy: config.createdBySeed
      },
      create: {
        userId: user.id,
        companyId: targetCompanyId,
        role,
        createdBy: config.createdBySeed
      }
    })
    console.log(`  ✅ ${user.email} → ${role}`)
  }

  // ────────────────────────────────────────────
  // 9. CREATE AI SETTINGS FOR COMPANIES
  // ────────────────────────────────────────────
  if (config.createAISettings) {
    console.log('\n🤖 Creating AI Settings...')
    
    const companies = [master, acme, beta]
    for (const company of companies) {
      await prisma.aISettings.upsert({
        where: { companyId: company.id },
        update: {},
        create: {
          companyId: company.id,
          monthlyBudget: 100.00,
          costPerReview: 0.02,
          costAlertThreshold: 80,
          enabled: true,
          defaultService: 'openai',
          defaultModel: 'gpt-3.5-turbo',
          autoShortlistThreshold: 75,
          useForSeniorRoles: true,
          useForTechnicalRoles: true,
          useForManagerRoles: true,
          notifyEmails: [
            config.masterAdminEmail,
            process.env.ACME_HR_EMAIL || 'hr@company.com',
            process.env.BETA_HR_EMAIL || 'hr@beta.com'
          ].filter(email => {
            // Only include emails for this company
            if (company.id === master.id) return email === config.masterAdminEmail
            if (company.id === acme.id) return email === (process.env.ACME_HR_EMAIL || 'hr@company.com')
            if (company.id === beta.id) return email === (process.env.BETA_HR_EMAIL || 'hr@beta.com')
            return false
          }),
          createdBy: config.createdBySeed
        }
      })
      console.log(`  ✅ ${company.companyName}`)
    }
  }

  console.log('\n✅ SEED COMPLETE!')
  
  // Show summary
  console.log('\n📋 Seed Summary:')
  console.log('---------------------------------------------')
  console.log('Companies: 3')
  console.log('Users: 7 (with varying access levels)')
  console.log('AI Settings: 3')
  console.log('Company Assignments: 3')
  console.log('---------------------------------------------\n')
  
  console.log('🔐 Login Credentials (from environment):')
  console.log('---------------------------------------------')
  console.log('MASTER SUPER ADMIN:')
  console.log(`  Email:    ${config.masterAdminEmail}`)
  console.log(`  Password: [${config.masterAdminPassword.substring(0, 3)}...]`)
  console.log('---------------------------------------------')
  console.log('ACME HR:')
  console.log(`  Email:    ${process.env.ACME_HR_EMAIL || 'hr@company.com'}`)
  console.log(`  Password: [${config.hrPassword.substring(0, 3)}...]`)
  console.log('---------------------------------------------')
  console.log('ACME STAFF (login-enabled):')
  console.log(`  Email:    ${process.env.ACME_STAFF1_EMAIL || 'staff1@acme.com'}`)
  console.log(`  Password: [${config.staffPassword.substring(0, 3)}...]`)
  console.log('---------------------------------------------')
  console.log('BETA HR:')
  console.log(`  Email:    ${process.env.BETA_HR_EMAIL || 'hr@beta.com'}`)
  console.log(`  Password: [${config.hrPassword.substring(0, 3)}...]`)
  console.log('---------------------------------------------')
  console.log('BETA STAFF (login-enabled):')
  console.log(`  Email:    ${process.env.BETA_STAFF1_EMAIL || 'staff1@beta.com'}`)
  console.log(`  Password: [${config.staffPassword.substring(0, 3)}...]`)
  console.log('---------------------------------------------\n')
  
  console.log('⚠️  SECURITY NOTES:')
  console.log('  1. Change passwords immediately after first login')
  console.log('  2. Review .env.production file for security settings')
  console.log('  3. Consider rotating passwords in production\n')
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