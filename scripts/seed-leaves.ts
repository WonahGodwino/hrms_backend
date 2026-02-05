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
    
    const policy = await prisma.leavePolicy.create({
      data: {
        companyId: company.id,
        name: 'Annual Leave',
        description: 'Test annual leave',
        maxDays: 20,
        carryOver: 5,
        isPaid: true,
        requiresApproval: true,
        approvalWorkflow: 'MANAGER_THEN_HR',
        noticePeriod: 14,
        documentationRequired: false,
        leaveTypes: {
          create: [
            {
              name: 'Vacation',
              code: 'AL',
              color: '#10B981',
              isActive: true
            }
          ]
        }
      }
    })
    
    console.log('✅ Successfully created leave policy:', policy.name)
    
    // Also create leave balances for existing staff
    console.log('Creating leave balances for existing staff...')
    
    const staffRecords = await prisma.staffRecord.findMany({
      where: {
        companyId: company.id,
        isActive: true
      },
      take: 5 // Just seed for first 5 staff
    })
    
    console.log(`Found ${staffRecords.length} active staff members`)
    
    for (const staff of staffRecords) {
      await prisma.staffLeaveBalance.create({
        data: {
          staffRecordId: staff.id,
          leaveTypeId: policy.leaveTypes[0].id, // Assuming first leave type
          year: new Date().getFullYear(),
          totalDays: 20,
          usedDays: 0,
          pendingDays: 0,
          carriedOverDays: 0
        }
      })
    }
    
    console.log('✅ Created leave balances for staff')
    console.log('🎉 Leave management seed completed successfully!')
    
  } catch (error) {
    // Handle TypeScript error by checking error type
    if (error instanceof Error) {
      console.error('❌ Error during seeding:', error.message)
      console.error('Error stack:', error.stack)
    } else {
      console.error('❌ Unknown error during seeding:', error)
    }
  } finally {
    await prisma.$disconnect()
    console.log('Database connection closed')
  }
}

// Run the seed
seedLeaves()