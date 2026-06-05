import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const companyId = 'cmkmqsya900010jp6pgd1bb3l' // test company
const createdBy = 'SYSTEM_SEED'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Seeding loans & benefits for test company...')

  // 1. Create demo staff
  const password = await bcrypt.hash('Staff123!', 10)
  const staff1 = await prisma.staffRecord.upsert({
    where: { email_companyId: { email: 'loantest1@testco.com', companyId } },
    update: {},
    create: {
      staffId: 'TESTCO-STAFF-001',
      email: 'loantest1@testco.com',
      firstName: 'Loan',
      lastName: 'Tester',
      department: 'Finance',
      position: 'Accountant',
      phone: '+2348000000001',
      companyId,
      role: 'STAFF',
      password,
      isRegistered: true,
      isActive: true,
      createdBy,
    },
  })
  const staff2 = await prisma.staffRecord.upsert({
    where: { email_companyId: { email: 'loantest2@testco.com', companyId } },
    update: {},
    create: {
      staffId: 'TESTCO-STAFF-002',
      email: 'loantest2@testco.com',
      firstName: 'Benefit',
      lastName: 'Demo',
      department: 'HR',
      position: 'HR Officer',
      phone: '+2348000000002',
      companyId,
      role: 'STAFF',
      password,
      isRegistered: true,
      isActive: true,
      createdBy,
    },
  })

  // 2. Create demo loans
  await prisma.loanRequest.createMany({
    data: [
      {
        companyId,
        staffId: staff1.id,
        loanType: 'PERSONAL_LOAN',
        requestedAmount: 500000,
        approvedAmount: 500000,
        tenureMonths: 12,
        purpose: 'Medical bills',
        status: 'DISBURSED',
        approvalComment: 'Approved for demo',
        approvedBy: staff2.id,
        approvedAt: new Date(),
        disbursedAt: new Date(),
        expectedRepaymentDate: new Date(new Date().setMonth(new Date().getMonth() + 12)),
        interestRate: 5.0,
        monthlyRepayment: 45000,
        remainingBalance: 225000,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy,
      },
      {
        companyId,
        staffId: staff2.id,
        loanType: 'SALARY_ADVANCE',
        requestedAmount: 100000,
        approvedAmount: 100000,
        tenureMonths: 3,
        purpose: 'School fees',
        status: 'APPROVED',
        approvalComment: 'Approved for demo',
        approvedBy: staff1.id,
        approvedAt: new Date(),
        disbursedAt: null,
        expectedRepaymentDate: new Date(new Date().setMonth(new Date().getMonth() + 3)),
        interestRate: 2.5,
        monthlyRepayment: 35000,
        remainingBalance: 100000,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy,
      },
    ],
    skipDuplicates: true,
  })

  // 3. Create demo benefits
  await prisma.benefitAllocation.createMany({
    data: [
      {
        companyId,
        staffId: staff1.id,
        benefitId: 'BENEFIT-001',
        benefitName: 'Health Insurance',
        allocationAmount: 200000,
        allocatedBy: staff2.id,
        note: 'Demo allocation',
        status: 'ALLOCATED',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        companyId,
        staffId: staff2.id,
        benefitId: 'BENEFIT-002',
        benefitName: 'Transport Allowance',
        allocationAmount: 50000,
        allocatedBy: staff1.id,
        note: 'Demo allocation',
        status: 'ALLOCATED',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    skipDuplicates: true,
  })

  // 4. Create demo benefit requests
  await prisma.benefitRequest.createMany({
    data: [
      {
        companyId,
        staffId: staff1.id,
        benefitId: 'BENEFIT-001',
        benefitName: 'Health Insurance',
        reason: 'Family medical',
        status: 'APPROVED',
        approvalComment: 'Demo approved',
        approvedBy: staff2.id,
        approvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy,
      },
      {
        companyId,
        staffId: staff2.id,
        benefitId: 'BENEFIT-002',
        benefitName: 'Transport Allowance',
        reason: 'Commute support',
        status: 'PENDING',
        approvalComment: null,
        approvedBy: null,
        approvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy,
      },
    ],
    skipDuplicates: true,
  })

  console.log('✅ Loans & benefits demo data seeded for test company!')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
}).finally(async () => {
  await prisma.$disconnect()
  await pool.end()
})
