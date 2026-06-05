-- PHED Payroll Redesign Migration
-- Adds: TEMPLATE_ISSUED status, voluntary pension/insurance fields,
--       cash advance/loan/domestic loan columns, new advances table

-- 1. Add TEMPLATE_ISSUED to the PhedPayPeriodStatus enum
ALTER TYPE "PhedPayPeriodStatus" ADD VALUE IF NOT EXISTS 'TEMPLATE_ISSUED';

-- 2. Add voluntary pension and insurance fields to phed_staff
ALTER TABLE "phed_staff"
  ADD COLUMN IF NOT EXISTS "voluntaryPension" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "insurance"        DECIMAL(18,2);

-- 3. Add new deduction columns to phed_computed_payrolls
ALTER TABLE "phed_computed_payrolls"
  ADD COLUMN IF NOT EXISTS "voluntaryPension" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "insurance"        DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cashAdvanced"     DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "loan"             DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "domesticLoan"     DECIMAL(18,2) NOT NULL DEFAULT 0;

-- 4. Create the new advances table
CREATE TABLE IF NOT EXISTS "phed_staff_period_advances" (
  "id"           TEXT         NOT NULL,
  "payPeriodId"  TEXT         NOT NULL,
  "staffId"      TEXT         NOT NULL,
  "companyId"    TEXT         NOT NULL,
  "cashAdvanced" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "loan"         DECIMAL(18,2) NOT NULL DEFAULT 0,
  "domesticLoan" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "phed_staff_period_advances_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one row per staff per period
CREATE UNIQUE INDEX IF NOT EXISTS "phed_staff_period_advances_payPeriodId_staffId_key"
  ON "phed_staff_period_advances"("payPeriodId", "staffId");

-- Index for period-level queries
CREATE INDEX IF NOT EXISTS "phed_staff_period_advances_payPeriodId_idx"
  ON "phed_staff_period_advances"("payPeriodId");

-- Foreign keys
ALTER TABLE "phed_staff_period_advances"
  ADD CONSTRAINT "phed_staff_period_advances_payPeriodId_fkey"
    FOREIGN KEY ("payPeriodId") REFERENCES "phed_pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "phed_staff_period_advances_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "phed_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "phed_staff_period_advances_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
