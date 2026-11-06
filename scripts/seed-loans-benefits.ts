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

  // 2. Create demo loan + benefit policies
  const loanPolicy = await prisma.loanPolicy.upsert({
    where: { companyId_name: { companyId, name: 'Personal Loan' } },
    update: {},
    create: {
      companyId,
      name: 'Personal Loan',
      interestRatePercent: 5,
      maxDurationMonths: 12,
      maxAmount: 500000,
      minServiceMonths: 3,
      maxDebtRatioPercent: 40,
      approvalWorkflow: [],
      createdBy,
    },
  })

  const healthPolicy = await prisma.benefitPolicy.upsert({
    where: { companyId_name: { companyId, name: 'Health Insurance' } },
    update: {},
    create: {
      companyId,
      name: 'Health Insurance',
      category: 'HEALTH',
      requestApprovalWorkflow: [],
      createdBy,
    },
  })

  const transportPolicy = await prisma.benefitPolicy.upsert({
    where: { companyId_name: { companyId, name: 'Transport Allowance' } },
    update: {},
    create: {
      companyId,
      name: 'Transport Allowance',
      category: 'TRANSPORT',
      requestApprovalWorkflow: [],
      createdBy,
    },
  })

  // 3. Create demo loans
  await prisma.loanRequest.createMany({
    data: [
      {
        companyId,
        staffId: staff1.id,
        loanPolicyId: loanPolicy.id,
        loanPolicyVersion: loanPolicy.version,
        loanType: 'Personal Loan',
        requestedAmount: 500000,
        approvedAmount: 500000,
        tenureMonths: 12,
        purpose: 'Medical bills',
        currencyCode: 'NGN',
        interestRatePercent: 5.0,
        status: 'DISBURSED',
        approvalWorkflow: [],
        approvedAt: new Date(),
        disbursedAt: new Date(),
        disbursedBy: staff2.id,
        expectedRepaymentDate: new Date(new Date().setMonth(new Date().getMonth() + 12)),
        monthlyRepayment: 45000,
        remainingBalance: 225000,
        createdBy,
      },
      {
        companyId,
        staffId: staff2.id,
        loanPolicyId: loanPolicy.id,
        loanPolicyVersion: loanPolicy.version,
        loanType: 'Salary Advance',
        requestedAmount: 100000,
        approvedAmount: 100000,
        tenureMonths: 3,
        purpose: 'School fees',
        currencyCode: 'NGN',
        interestRatePercent: 2.5,
        status: 'APPROVED',
        approvalWorkflow: [],
        approvedAt: new Date(),
        expectedRepaymentDate: new Date(new Date().setMonth(new Date().getMonth() + 3)),
        monthlyRepayment: 35000,
        remainingBalance: 100000,
        createdBy,
      },
    ],
    skipDuplicates: true,
  })

  // 4. Create demo benefit allocations
  await prisma.benefitAllocation.createMany({
    data: [
      {
        companyId,
        staffId: staff1.id,
        benefitPolicyId: healthPolicy.id,
        benefitPolicyVersion: healthPolicy.version,
        benefitName: 'Health Insurance',
        allocationAmount: 200000,
        currencyCode: 'NGN',
        allocatedBy: staff2.id,
        note: 'Demo allocation',
        status: 'ACTIVE',
      },
      {
        companyId,
        staffId: staff2.id,
        benefitPolicyId: transportPolicy.id,
        benefitPolicyVersion: transportPolicy.version,
        benefitName: 'Transport Allowance',
        allocationAmount: 50000,
        currencyCode: 'NGN',
        allocatedBy: staff1.id,
        note: 'Demo allocation',
        status: 'ACTIVE',
      },
    ],
    skipDuplicates: true,
  })

  // 5. Create demo benefit requests
  await prisma.benefitRequest.createMany({
    data: [
      {
        companyId,
        staffId: staff1.id,
        benefitPolicyId: healthPolicy.id,
        benefitPolicyVersion: healthPolicy.version,
        benefitName: 'Health Insurance',
        currencyCode: 'NGN',
        reason: 'Family medical',
        status: 'APPROVED',
        approvalWorkflow: [],
        approvedAt: new Date(),
        createdBy,
      },
      {
        companyId,
        staffId: staff2.id,
        benefitPolicyId: transportPolicy.id,
        benefitPolicyVersion: transportPolicy.version,
        benefitName: 'Transport Allowance',
        currencyCode: 'NGN',
        reason: 'Commute support',
        status: 'PENDING_APPROVAL',
        approvalWorkflow: [],
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
