-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('PERSONAL_LOAN', 'EMERGENCY_LOAN', 'SALARY_ADVANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "LoanRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DISBURSED', 'REPAID', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "BenefitRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ALLOCATED', 'COMPLETED', 'CANCELLED');

-- CreateTable "loan_requests"
CREATE TABLE "loan_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "loanType" "LoanType" NOT NULL DEFAULT 'PERSONAL_LOAN',
    "requestedAmount" DECIMAL(18,2) NOT NULL,
    "approvedAmount" DECIMAL(18,2),
    "tenureMonths" INTEGER NOT NULL,
    "purpose" TEXT,
    "status" "LoanRequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "approvalComment" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "disbursedAt" TIMESTAMP(3),
    "expectedRepaymentDate" TIMESTAMP(3),
    "interestRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "monthlyRepayment" DECIMAL(18,2),
    "remainingBalance" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "loan_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable "benefit_requests"
CREATE TABLE "benefit_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "benefitId" TEXT NOT NULL,
    "benefitName" TEXT NOT NULL,
    "reason" TEXT,
    "status" "BenefitRequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "approvalComment" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "benefit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable "benefit_allocations"
CREATE TABLE "benefit_allocations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "benefitId" TEXT NOT NULL,
    "benefitName" TEXT NOT NULL,
    "allocationAmount" DECIMAL(18,2) NOT NULL,
    "allocatedBy" TEXT NOT NULL,
    "note" TEXT,
    "status" "BenefitRequestStatus" NOT NULL DEFAULT 'ALLOCATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benefit_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loan_requests_staffId_companyId_idx" ON "loan_requests"("staffId", "companyId");

-- CreateIndex
CREATE INDEX "loan_requests_companyId_status_idx" ON "loan_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "loan_requests_status_createdAt_idx" ON "loan_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "loan_requests_staffId_status_idx" ON "loan_requests"("staffId", "status");

-- CreateIndex
CREATE INDEX "benefit_requests_staffId_companyId_idx" ON "benefit_requests"("staffId", "companyId");

-- CreateIndex
CREATE INDEX "benefit_requests_companyId_status_idx" ON "benefit_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "benefit_requests_status_createdAt_idx" ON "benefit_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "benefit_requests_staffId_status_idx" ON "benefit_requests"("staffId", "status");

-- CreateIndex
CREATE INDEX "benefit_allocations_staffId_companyId_idx" ON "benefit_allocations"("staffId", "companyId");

-- CreateIndex
CREATE INDEX "benefit_allocations_companyId_createdAt_idx" ON "benefit_allocations"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "benefit_allocations_staffId_createdAt_idx" ON "benefit_allocations"("staffId", "createdAt");

-- AddForeignKey
ALTER TABLE "loan_requests" ADD CONSTRAINT "loan_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_requests" ADD CONSTRAINT "loan_requests_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_requests" ADD CONSTRAINT "loan_requests_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_requests" ADD CONSTRAINT "benefit_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_requests" ADD CONSTRAINT "benefit_requests_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_requests" ADD CONSTRAINT "benefit_requests_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_allocations" ADD CONSTRAINT "benefit_allocations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_allocations" ADD CONSTRAINT "benefit_allocations_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_allocations" ADD CONSTRAINT "benefit_allocations_allocatedBy_fkey" FOREIGN KEY ("allocatedBy") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
