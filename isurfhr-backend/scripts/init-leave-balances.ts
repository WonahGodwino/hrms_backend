// prisma/scripts/init-leave-balances.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function initializeLeaveBalances() {
  console.log('Initializing leave balances for existing staff...')
  
  // Get all active companies with their leave policies
  const companies = await prisma.company.findMany({
    where: { archived: 0 },
    include: {
      leavePolicies: {
        include: {
          leaveTypes: true
        }
      }
    }
  })
  
  for (const company of companies) {
    console.log(`Processing company: ${company.companyName}`)
    
    // Get all active staff in this company
    const staff = await prisma.staffRecord.findMany({
      where: {
        companyId: company.id,
        isActive: true
      }
    })
    
    console.log(`Found ${staff.length} active staff members`)
    
    let balancesCreated = 0
    let balancesSkipped = 0
    
    for (const staffMember of staff) {
      // For each leave type, create a balance record
      for (const policy of company.leavePolicies) {
        for (const leaveType of policy.leaveTypes) {
          if (!leaveType.isActive) continue
          
          // Check if balance already exists for current year
          const currentYear = new Date().getFullYear()
          const existingBalance = await prisma.staffLeaveBalance.findFirst({
            where: {
              staffRecordId: staffMember.id,
              leaveTypeId: leaveType.id,
              year: currentYear
            }
          })
          
          if (existingBalance) {
            balancesSkipped++
            continue
          }
          
          try {
            // Calculate days based on employment duration
            const employmentStart = staffMember.createdAt
            const now = new Date()
            const monthsDiff = (now.getFullYear() - employmentStart.getFullYear()) * 12 + 
                              (now.getMonth() - employmentStart.getMonth())
            
            // Only create balance if staff meets minimum employment requirement
            if (monthsDiff >= policy.minEmploymentMonths) {
              // Calculate pro-rated entitlement for current year
              let totalDays = policy.maxDays
              
              if (policy.accrualRate && monthsDiff < 12) {
                // Pro-rate based on months employed in current year
                const monthsInYear = Math.min(monthsDiff, 12)
                totalDays = Math.floor(policy.accrualRate * monthsInYear)
              }
              
              // Ensure minimum of 1 day if eligible
              if (totalDays < 1 && monthsDiff >= policy.minEmploymentMonths) {
                totalDays = 1
              }
              
              await prisma.staffLeaveBalance.create({
                data: {
                  staffRecordId: staffMember.id,
                  leaveTypeId: leaveType.id,
                  year: currentYear,
                  totalDays: totalDays,
                  usedDays: 0,
                  pendingDays: 0,
                  carriedOver: 0
                }
              })
              
              balancesCreated++
            }
          } catch (error) {
            console.error(`Error creating balance for staff ${staffMember.staffId}, leave type ${leaveType.name}:`, error)
          }
        }
      }
    }
    
    console.log(`Company ${company.companyName}: Created ${balancesCreated} balances, skipped ${balancesSkipped} existing balances`)
  }
  
  console.log('Leave balance initialization completed!')
  console.log('Total balances created:', await prisma.staffLeaveBalance.count())
}

initializeLeaveBalances()
  .catch((e) => {
    console.error('Error initializing leave balances:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })