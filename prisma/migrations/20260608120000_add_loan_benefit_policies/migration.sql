-- CreateTable: LoanPolicy
CREATE TABLE "LoanPolicy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "interestRatePercent" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "maxDurationMonths" INTEGER NOT NULL DEFAULT 12,
    "maxAmount" DOUBLE PRECISION NOT NULL DEFAULT 500000,
    "minServiceMonths" INTEGER NOT NULL DEFAULT 3,
    "maxDebtRatioPercent" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "requiresGuarantor" BOOLEAN NOT NULL DEFAULT false,
    "guarantorThresholdAmount" DOUBLE PRECISION,
    "guarantorMustBeActiveInCompany" BOOLEAN NOT NULL DEFAULT true,
    "guarantorMustNotHaveActiveLoan" BOOLEAN NOT NULL DEFAULT false,
    "salaryMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rules" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BenefitPolicy
CREATE TABLE "BenefitPolicy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "monetaryValue" DOUBLE PRECISION,
    "keyValue" TEXT,
    "eligibilityRule" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenefitPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoanPolicy_companyId_name_key" ON "LoanPolicy"("companyId", "name");

-- CreateIndex
CREATE INDEX "LoanPolicy_companyId_isActive_idx" ON "LoanPolicy"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BenefitPolicy_companyId_name_key" ON "BenefitPolicy"("companyId", "name");

-- CreateIndex
CREATE INDEX "BenefitPolicy_companyId_isActive_idx" ON "BenefitPolicy"("companyId", "isActive");

-- AddForeignKey
ALTER TABLE "LoanPolicy" ADD CONSTRAINT "LoanPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitPolicy" ADD CONSTRAINT "BenefitPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;