// scripts/seed-leaves.ts
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '@prisma/client'

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

async function seedLeaves() {
  console.log('Starting leave management seeding...')
  
  try {
    // Test connection with a simple query
    console.log('Testing database connection...')
    const test = await prisma.$queryRaw`SELECT 1 as test`
    console.log('✅ Database connection successful')
    
    // Get companies
    const companies = await prisma.company.findMany({
      where: { archived: 0 },
      take: 1 // Just test with 1 company for now
    })
    
    console.log(`Found ${companies.length} companies`)
    
    if (companies.length === 0) {
      console.log('No companies found. Exiting.')
      return
    }
    
    // Create a simple leave policy for testing
    const company = companies[0]
    console.log(`Creating leave policy for ${company.companyName}...`)
    
    // First create the policy
    const policy = await prisma.leavePolicy.create({
      data: {
        companyId: company.id,
        name: 'Annual Leave',
        description: 'Annual paid vacation leave for employees',
        maxDays: 20,
        carryOver: 5,
        isPaid: true,
        accrualRate: 1.67, // 20 days / 12 months
        minEmploymentMonths: 3,
        requiresApproval: true,
        approvalWorkflow: 'MANAGER_THEN_HR',
        noticePeriod: 14,
        documentationRequired: false,
        allowHalfDays: true,
        maxConsecutiveDays: 15,
        seasonalRestrictions: '12,1', // December and January restrictions
        requireManagerComments: true
      }
    })
    
    console.log('✅ Successfully created leave policy:', policy.name)
    
    // Then create the leave type
    const leaveType = await prisma.leaveType.create({
      data: {
        policyId: policy.id,
        name: 'Vacation Leave',
        code: 'VL',
        description: 'Regular vacation time off',
        color: '#10B981',
        isActive: true
      }
    })
    
    console.log('✅ Successfully created leave type:', leaveType.name)
    
    // Create another leave policy and type
    const sickLeavePolicy = await prisma.leavePolicy.create({
      data: {
        companyId: company.id,
        name: 'Sick Leave',
        description: 'Paid sick leave for medical reasons',
        maxDays: 15,
        carryOver: 0,
        isPaid: true,
        accrualRate: 1.25, // 15 days / 12 months
        minEmploymentMonths: 0,
        requiresApproval: false,
        approvalWorkflow: 'NONE',
        noticePeriod: 0,
        documentationRequired: true,
        allowHalfDays: true,
        maxConsecutiveDays: 5,
        seasonalRestrictions: null,
        requireManagerComments: false
      }
    })
    
    console.log('✅ Successfully created sick leave policy:', sickLeavePolicy.name)
    
    const sickLeaveType = await prisma.leaveType.create({
      data: {
        policyId: sickLeavePolicy.id,
        name: 'Sick Leave',
        code: 'SL',
        description: 'Medical leave with documentation',
        color: '#EF4444',
        isActive: true
      }
    })
    
    console.log('✅ Successfully created sick leave type:', sickLeaveType.name)
    
    // Also create leave balances for existing staff
    console.log('Creating leave balances for existing staff...')
    
    const staffRecords = await prisma.staffRecord.findMany({
      where: {
        companyId: company.id,
        isActive: true
      },
      take: 10 // Seed for first 10 staff
    })
    
    console.log(`Found ${staffRecords.length} active staff members`)
    
    let balancesCreated = 0
    for (const staff of staffRecords) {
      try {
        // Create annual leave balance
        await prisma.staffLeaveBalance.create({
          data: {
            staffRecordId: staff.id,
            leaveTypeId: leaveType.id,
            year: new Date().getFullYear(),
            totalDays: 20,
            usedDays: 0,
            pendingDays: 0,
            carriedOver: 0,
            notes: 'Initial seed balance'
          }
        })
        
        // Create sick leave balance
        await prisma.staffLeaveBalance.create({
          data: {
            staffRecordId: staff.id,
            leaveTypeId: sickLeaveType.id,
            year: new Date().getFullYear(),
            totalDays: 15,
            usedDays: 0,
            pendingDays: 0,
            carriedOver: 0,
            notes: 'Initial seed balance'
          }
        })
        
        balancesCreated += 2
      } catch (error) {
        console.log(`⚠️  Could not create balance for staff ${staff.staffId}:`, error instanceof Error ? error.message : 'Unknown error')
      }
    }
    
    console.log(`✅ Created ${balancesCreated} leave balances for staff`)
    
    // Create some public holidays
    console.log('Creating public holidays...')
    
    const holidays = [
      {
        name: 'New Year\'s Day',
        date: new Date(new Date().getFullYear(), 0, 1), // Jan 1
        isRecurring: true,
        description: 'Celebration of new year',
        country: 'NG',
        state: 'All'
      },
      {
        name: 'Independence Day',
        date: new Date(new Date().getFullYear(), 9, 1), // Oct 1
        isRecurring: true,
        description: 'Nigeria Independence Day',
        country: 'NG',
        state: 'All'
      },
      {
        name: 'Christmas Day',
        date: new Date(new Date().getFullYear(), 11, 25), // Dec 25
        isRecurring: true,
        description: 'Christmas celebration',
        country: 'NG',
        state: 'All'
      }
    ]
    
    for (const holiday of holidays) {
      try {
        await prisma.publicHoliday.create({
          data: {
            companyId: company.id,
            ...holiday
          }
        })
        console.log(`✅ Created holiday: ${holiday.name}`)
      } catch (error) {
        console.log(`⚠️  Could not create holiday ${holiday.name}:`, error instanceof Error ? error.message : 'Unknown error')
      }
    }
    
    console.log('🎉 Leave management seed completed successfully!')
    
  } catch (error) {
    // Handle TypeScript error by checking error type
    if (error instanceof Error) {
      console.error('❌ Error during seeding:', error.message)
      console.error('Error stack:', error.stack)
    } else {
      console.error('❌ Unknown error during seeding:', error)
    }
    process.exit(1)
  } finally {
    await prisma.$disconnect()
    console.log('Database connection closed')
  }
}

// Run the seed
seedLeaves()