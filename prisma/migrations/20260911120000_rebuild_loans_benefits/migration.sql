-- Staff Loans & Benefits — ground-up rebuild. Per explicit user decision,
-- existing LoanRequest/BenefitRequest/BenefitAllocation/LoanPolicy/BenefitPolicy
-- data is dropped entirely, not archived. Hand-authored (not via `prisma
-- migrate dev`) for the same shadow-database-drift reason documented in
-- 20260902120000_add_payroll_generation_module; safe to apply with
-- `prisma db execute` directly against the real database.
--
-- Confirmed via direct query before writing this file: no foreign keys from
-- any other table reference LoanPolicy/BenefitPolicy/loan_requests/
-- benefit_requests/benefit_allocations — safe to drop outright. The
-- unrelated `Benefit` (grade-level catalog) and `_GradeBenefits` join table
-- are NOT touched here — different concept, same word.

-- ─── Drop old tables ───
DROP TABLE IF EXISTS "loan_requests" CASCADE;
DROP TABLE IF EXISTS "benefit_requests" CASCADE;
DROP TABLE IF EXISTS "benefit_allocations" CASCADE;
DROP TABLE IF EXISTS "LoanPolicy" CASCADE;
DROP TABLE IF EXISTS "BenefitPolicy" CASCADE;

-- ─── Drop old enums (values are changing) ───
DROP TYPE IF EXISTS "LoanRequestStatus";
DROP TYPE IF EXISTS "BenefitRequestStatus";

-- ─── New enums ───
CREATE TYPE "LoanRequestStatus" AS ENUM ('PENDING_GUARANTOR', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'DISBURSED', 'REPAID', 'DEFAULTED', 'CANCELLED');
CREATE TYPE "LoanInstallmentStatus" AS ENUM ('SCHEDULED', 'DUE', 'PARTIALLY_PAID', 'PAID', 'MISSED', 'WAIVED');
CREATE TYPE "GuarantorStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'ACCEPTED', 'DECLINED');
CREATE TYPE "BenefitRequestStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "BenefitAllocationStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'EXPIRED', 'CANCELLED', 'SUSPENDED');
CREATE TYPE "ClaimStatus" AS ENUM ('SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED');
CREATE TYPE "ApprovableRequestType" AS ENUM ('LOAN_REQUEST', 'BENEFIT_REQUEST', 'BENEFIT_CLAIM');
CREATE TYPE "ApprovalActionType" AS ENUM ('APPROVED', 'REJECTED');

-- ─── loan_policies ───
CREATE TABLE "loan_policies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "minServiceMonths" INTEGER NOT NULL DEFAULT 3,
    "maxDebtRatioPercent" DECIMAL(5,2) NOT NULL DEFAULT 40,
    "eligibilityRules" JSONB,
    "maxAmount" DECIMAL(18,2) NOT NULL DEFAULT 500000,
    "salaryMultiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    "maxDurationMonths" INTEGER NOT NULL DEFAULT 12,
    "interestRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "interestByDuration" JSONB,
    "processingFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "autoDeductionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 0,
    "requiresGuarantor" BOOLEAN NOT NULL DEFAULT false,
    "guarantorThresholdAmount" DECIMAL(18,2),
    "guarantorMustBeActiveInCompany" BOOLEAN NOT NULL DEFAULT true,
    "guarantorMustNotHaveActiveLoan" BOOLEAN NOT NULL DEFAULT true,
    "maxGuarantorExposure" DECIMAL(18,2),
    "maxActiveLoansPerStaff" INTEGER NOT NULL DEFAULT 1,
    "approvalWorkflow" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "loan_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "loan_policies_companyId_name_key" ON "loan_policies"("companyId", "name");
CREATE INDEX "loan_policies_companyId_isActive_idx" ON "loan_policies"("companyId", "isActive");
ALTER TABLE "loan_policies" ADD CONSTRAINT "loan_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── loan_requests ───
CREATE TABLE "loan_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "loanPolicyId" TEXT NOT NULL,
    "loanPolicyVersion" INTEGER NOT NULL,
    "loanType" TEXT NOT NULL,
    "requestedAmount" DECIMAL(18,2) NOT NULL,
    "approvedAmount" DECIMAL(18,2),
    "tenureMonths" INTEGER NOT NULL,
    "purpose" TEXT,
    "currencyCode" VARCHAR(3) NOT NULL,
    "interestRatePercent" DECIMAL(5,2) NOT NULL,
    "processingFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "processingFeeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "monthlyRepayment" DECIMAL(18,2),
    "totalRepayable" DECIMAL(18,2),
    "remainingBalance" DECIMAL(18,2),
    "status" "LoanRequestStatus" NOT NULL DEFAULT 'PENDING_GUARANTOR',
    "approvalWorkflow" JSONB NOT NULL,
    "currentStepOrder" INTEGER,
    "currentApproverRole" TEXT,
    "currentApproverStaffId" TEXT,
    "rejectionReason" TEXT,
    "rejectedAtStep" INTEGER,
    "rejectedByRole" TEXT,
    "approvedAt" TIMESTAMP(3),
    "disbursedAt" TIMESTAMP(3),
    "disbursedBy" TEXT,
    "expectedRepaymentDate" TIMESTAMP(3),
    "signature" TEXT,
    "signatureType" VARCHAR(20),
    "signedAt" TIMESTAMP(3),
    "documentUrls" JSONB,
    "guarantorStaffId" TEXT,
    "guarantorStatus" "GuarantorStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "guarantorToken" TEXT,
    "guarantorTokenExpiry" TIMESTAMP(3),
    "guarantorRespondedAt" TIMESTAMP(3),
    "guarantorDeclineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "loan_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "loan_requests_guarantorToken_key" ON "loan_requests"("guarantorToken");
CREATE INDEX "loan_requests_companyId_status_idx" ON "loan_requests"("companyId", "status");
CREATE INDEX "loan_requests_staffId_idx" ON "loan_requests"("staffId");
CREATE INDEX "loan_requests_guarantorStaffId_idx" ON "loan_requests"("guarantorStaffId");
CREATE INDEX "loan_requests_companyId_status_currentApproverRole_idx" ON "loan_requests"("companyId", "status", "currentApproverRole");
ALTER TABLE "loan_requests" ADD CONSTRAINT "loan_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loan_requests" ADD CONSTRAINT "loan_requests_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loan_requests" ADD CONSTRAINT "loan_requests_guarantorStaffId_fkey" FOREIGN KEY ("guarantorStaffId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loan_requests" ADD CONSTRAINT "loan_requests_loanPolicyId_fkey" FOREIGN KEY ("loanPolicyId") REFERENCES "loan_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── loan_installments ───
CREATE TABLE "loan_installments" (
    "id" TEXT NOT NULL,
    "loanRequestId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "principalDue" DECIMAL(18,2) NOT NULL,
    "interestDue" DECIMAL(18,2) NOT NULL,
    "totalDue" DECIMAL(18,2) NOT NULL,
    "amountPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "LoanInstallmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "paidAt" TIMESTAMP(3),
    "recoveryMethod" TEXT,
    "recoveryNote" TEXT,
    "recordedBy" TEXT,
    "payrollGenerationRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "loan_installments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "loan_installments_loanRequestId_installmentNumber_key" ON "loan_installments"("loanRequestId", "installmentNumber");
CREATE INDEX "loan_installments_companyId_status_dueDate_idx" ON "loan_installments"("companyId", "status", "dueDate");
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_loanRequestId_fkey" FOREIGN KEY ("loanRequestId") REFERENCES "loan_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── benefit_policies ───
CREATE TABLE "benefit_policies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "benefitType" TEXT NOT NULL DEFAULT 'FIXED_AMOUNT',
    "description" TEXT,
    "monetaryValue" DECIMAL(18,2),
    "keyValue" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "eligibilityRules" JSONB,
    "jobId" TEXT,
    "designationId" TEXT,
    "gradeLevelId" TEXT,
    "usageLimitAmount" DECIMAL(18,2),
    "usageFrequency" TEXT,
    "rollingValidityMonths" INTEGER,
    "maxUsagePerEmployee" DECIMAL(18,2),
    "maxClaimAmount" DECIMAL(18,2),
    "carryOverAllowed" BOOLEAN NOT NULL DEFAULT false,
    "requiresClaimSubmission" BOOLEAN NOT NULL DEFAULT false,
    "requiresClaimApproval" BOOLEAN NOT NULL DEFAULT true,
    "requestApprovalWorkflow" JSONB NOT NULL,
    "claimApprovalWorkflow" JSONB,
    "totalAllocatedBudget" DECIMAL(18,2),
    "perEmployeeCap" DECIMAL(18,2),
    "departmentalCaps" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "benefit_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "benefit_policies_companyId_name_key" ON "benefit_policies"("companyId", "name");
CREATE INDEX "benefit_policies_companyId_isActive_idx" ON "benefit_policies"("companyId", "isActive");
CREATE INDEX "benefit_policies_companyId_jobId_idx" ON "benefit_policies"("companyId", "jobId");
CREATE INDEX "benefit_policies_companyId_designationId_idx" ON "benefit_policies"("companyId", "designationId");
ALTER TABLE "benefit_policies" ADD CONSTRAINT "benefit_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── benefit_requests ───
CREATE TABLE "benefit_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "benefitPolicyId" TEXT NOT NULL,
    "benefitPolicyVersion" INTEGER NOT NULL,
    "benefitName" TEXT NOT NULL,
    "requestedAmount" DECIMAL(18,2),
    "currencyCode" VARCHAR(3) NOT NULL,
    "expectedStartDate" TIMESTAMP(3),
    "reason" TEXT,
    "status" "BenefitRequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approvalWorkflow" JSONB NOT NULL,
    "currentStepOrder" INTEGER,
    "currentApproverRole" TEXT,
    "currentApproverStaffId" TEXT,
    "rejectionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "benefit_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "benefit_requests_companyId_status_currentApproverRole_idx" ON "benefit_requests"("companyId", "status", "currentApproverRole");
ALTER TABLE "benefit_requests" ADD CONSTRAINT "benefit_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "benefit_requests" ADD CONSTRAINT "benefit_requests_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "benefit_requests" ADD CONSTRAINT "benefit_requests_benefitPolicyId_fkey" FOREIGN KEY ("benefitPolicyId") REFERENCES "benefit_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── benefit_allocations ───
CREATE TABLE "benefit_allocations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "benefitPolicyId" TEXT NOT NULL,
    "benefitPolicyVersion" INTEGER NOT NULL,
    "benefitName" TEXT NOT NULL,
    "sourceRequestId" TEXT,
    "allocationAmount" DECIMAL(18,2) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "amountUsed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "BenefitAllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3),
    "allocatedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "benefit_allocations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "benefit_allocations_staffId_companyId_idx" ON "benefit_allocations"("staffId", "companyId");
CREATE INDEX "benefit_allocations_companyId_createdAt_idx" ON "benefit_allocations"("companyId", "createdAt");
ALTER TABLE "benefit_allocations" ADD CONSTRAINT "benefit_allocations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "benefit_allocations" ADD CONSTRAINT "benefit_allocations_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "benefit_allocations" ADD CONSTRAINT "benefit_allocations_allocatedBy_fkey" FOREIGN KEY ("allocatedBy") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "benefit_allocations" ADD CONSTRAINT "benefit_allocations_benefitPolicyId_fkey" FOREIGN KEY ("benefitPolicyId") REFERENCES "benefit_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── benefit_claims ───
CREATE TABLE "benefit_claims" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "benefitAllocationId" TEXT,
    "benefitPolicyId" TEXT NOT NULL,
    "benefitPolicyVersion" INTEGER NOT NULL,
    "benefitName" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "attachmentUrls" JSONB,
    "status" "ClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
    "approvalWorkflow" JSONB NOT NULL,
    "currentStepOrder" INTEGER,
    "currentApproverRole" TEXT,
    "currentApproverStaffId" TEXT,
    "rejectionReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "benefit_claims_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "benefit_claims_companyId_status_currentApproverRole_idx" ON "benefit_claims"("companyId", "status", "currentApproverRole");
ALTER TABLE "benefit_claims" ADD CONSTRAINT "benefit_claims_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "benefit_claims" ADD CONSTRAINT "benefit_claims_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "benefit_claims" ADD CONSTRAINT "benefit_claims_benefitAllocationId_fkey" FOREIGN KEY ("benefitAllocationId") REFERENCES "benefit_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "benefit_claims" ADD CONSTRAINT "benefit_claims_benefitPolicyId_fkey" FOREIGN KEY ("benefitPolicyId") REFERENCES "benefit_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── approval_action_logs ───
CREATE TABLE "approval_action_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestType" "ApprovableRequestType" NOT NULL,
    "requestId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "stepRole" TEXT NOT NULL,
    "action" "ApprovalActionType" NOT NULL,
    "actorStaffId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_action_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approval_action_logs_companyId_requestType_requestId_idx" ON "approval_action_logs"("companyId", "requestType", "requestId");
