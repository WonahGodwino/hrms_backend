// scripts/seed-leaves-simple.ts - MINIMAL WORKING VERSION
const { PrismaClient } = require('@prisma/client')

async function seedLeaves() {
  console.log('Starting leave management seeding...')
  
  // Initialize PrismaClient without any special configuration
  const prisma = new PrismaClient()
  
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
    console.log('🎉 Seed completed successfully!')
    
  } catch (error) {
    console.error('❌ Error during seeding:', error.message)
    console.error('Full error:', error)
  } finally {
    await prisma.$disconnect()
    console.log('Database connection closed')
  }
}

// Run the seed
seedLeaves()