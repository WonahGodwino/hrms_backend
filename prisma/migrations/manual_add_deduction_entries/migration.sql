-- Create DeductionType enum if it doesn't exist
DO clear 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeductionType') THEN
        CREATE TYPE "DeductionType" AS ENUM ('UNION_DUES', 'COOPERATIVE', 'LOAN', 'SALARY_ADVANCE', 'OTHER');
    END IF;
END clear;

-- Create deduction_entries table
CREATE TABLE IF NOT EXISTS "deduction_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payPeriodId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deductionType" "DeductionType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "sourceFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "deduction_entries_payPeriodId_staffId_idx" ON "deduction_entries"("payPeriodId", "staffId");
CREATE INDEX IF NOT EXISTS "deduction_entries_payPeriodId_deductionType_idx" ON "deduction_entries"("payPeriodId", "deductionType");
CREATE INDEX IF NOT EXISTS "deduction_entries_companyId_idx" ON "deduction_entries"("companyId");
CREATE INDEX IF NOT EXISTS "deduction_entries_sourceFileId_idx" ON "deduction_entries"("sourceFileId");

-- Add foreign keys
DO clear 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deduction_entries_staffId_fkey') THEN
        ALTER TABLE "deduction_entries" ADD CONSTRAINT "deduction_entries_staffId_fkey" 
            FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deduction_entries_companyId_fkey') THEN
        ALTER TABLE "deduction_entries" ADD CONSTRAINT "deduction_entries_companyId_fkey" 
            FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE;
    END IF;
END clear;
