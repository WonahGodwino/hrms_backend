-- Add tax filing schema objects (production-safe, additive only)

-- Create enum if it does not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FilingStatus') THEN
    CREATE TYPE "FilingStatus" AS ENUM ('PENDING', 'GENERATED', 'FILED', 'CONFIRMED');
  END IF;
END $$;

-- Employee tax profiles
CREATE TABLE IF NOT EXISTS "employee_tax_profiles" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "stateOfResidence" TEXT NOT NULL,
  "jtbTin" TEXT,
  "tinVerified" BOOLEAN NOT NULL DEFAULT false,
  "lockedState" TEXT,
  "lockedDate" TIMESTAMP(3),
  "pfaName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "employee_tax_profiles_pkey" PRIMARY KEY ("id")
);

-- Monthly tax filing schedules by state
CREATE TABLE IF NOT EXISTS "tax_filing_schedules" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "payPeriodId" TEXT NOT NULL,
  "stateIrs" TEXT NOT NULL,
  "stateCode" TEXT NOT NULL,
  "stateName" TEXT NOT NULL,
  "totalEmployees" INTEGER NOT NULL,
  "totalTaxAmount" DECIMAL(15,2) NOT NULL,
  "totalGrossIncome" DECIMAL(15,2) NOT NULL,
  "status" "FilingStatus" NOT NULL DEFAULT 'PENDING',
  "filedAt" TIMESTAMP(3),
  "filedBy" TEXT,
  "paymentReference" TEXT,
  "filePath" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tax_filing_schedules_pkey" PRIMARY KEY ("id")
);

-- Annual state tax returns (Form H1)
CREATE TABLE IF NOT EXISTS "annual_returns" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "stateIrs" TEXT NOT NULL,
  "stateCode" TEXT NOT NULL,
  "stateName" TEXT NOT NULL,
  "totalEmployees" INTEGER NOT NULL,
  "totalGrossIncome" DECIMAL(15,2) NOT NULL,
  "totalTaxPaid" DECIMAL(15,2) NOT NULL,
  "status" "FilingStatus" NOT NULL DEFAULT 'PENDING',
  "filedAt" TIMESTAMP(3),
  "filedBy" TEXT,
  "formH1FilePath" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "annual_returns_pkey" PRIMARY KEY ("id")
);

-- Bulk upload tracking for tax profiles
CREATE TABLE IF NOT EXISTS "tax_profile_uploads" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "totalRecords" INTEGER NOT NULL,
  "successful" INTEGER NOT NULL,
  "failed" INTEGER NOT NULL,
  "errors" TEXT[],
  "failedFilePath" TEXT,
  "uploadedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tax_profile_uploads_pkey" PRIMARY KEY ("id")
);

-- Unique constraints/indexes
CREATE UNIQUE INDEX IF NOT EXISTS "employee_tax_profiles_staffId_key" ON "employee_tax_profiles"("staffId");
CREATE UNIQUE INDEX IF NOT EXISTS "tax_filing_schedules_companyId_payPeriodId_stateCode_key" ON "tax_filing_schedules"("companyId", "payPeriodId", "stateCode");
CREATE UNIQUE INDEX IF NOT EXISTS "annual_returns_companyId_year_stateCode_key" ON "annual_returns"("companyId", "year", "stateCode");

CREATE INDEX IF NOT EXISTS "employee_tax_profiles_companyId_stateOfResidence_idx" ON "employee_tax_profiles"("companyId", "stateOfResidence");
CREATE INDEX IF NOT EXISTS "tax_filing_schedules_companyId_status_idx" ON "tax_filing_schedules"("companyId", "status");
CREATE INDEX IF NOT EXISTS "tax_filing_schedules_payPeriodId_idx" ON "tax_filing_schedules"("payPeriodId");
CREATE INDEX IF NOT EXISTS "annual_returns_companyId_year_idx" ON "annual_returns"("companyId", "year");
CREATE INDEX IF NOT EXISTS "tax_profile_uploads_companyId_idx" ON "tax_profile_uploads"("companyId");

-- Foreign keys (guarded to avoid duplicate-key failures)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_tax_profiles_staffId_fkey'
  ) THEN
    ALTER TABLE "employee_tax_profiles"
      ADD CONSTRAINT "employee_tax_profiles_staffId_fkey"
      FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_tax_profiles_companyId_fkey'
  ) THEN
    ALTER TABLE "employee_tax_profiles"
      ADD CONSTRAINT "employee_tax_profiles_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tax_filing_schedules_companyId_fkey'
  ) THEN
    ALTER TABLE "tax_filing_schedules"
      ADD CONSTRAINT "tax_filing_schedules_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tax_filing_schedules_payPeriodId_fkey'
  ) THEN
    ALTER TABLE "tax_filing_schedules"
      ADD CONSTRAINT "tax_filing_schedules_payPeriodId_fkey"
      FOREIGN KEY ("payPeriodId") REFERENCES "pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'annual_returns_companyId_fkey'
  ) THEN
    ALTER TABLE "annual_returns"
      ADD CONSTRAINT "annual_returns_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tax_profile_uploads_companyId_fkey'
  ) THEN
    ALTER TABLE "tax_profile_uploads"
      ADD CONSTRAINT "tax_profile_uploads_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
