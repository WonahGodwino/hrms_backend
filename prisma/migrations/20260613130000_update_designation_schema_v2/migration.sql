-- Migration v2: Add companyId, status, description to Designation
-- Replaces 20260613090000 which failed due to wrong table name

-- Add columns (idempotent - uses IF NOT EXISTS)
ALTER TABLE "Designation" 
  ADD COLUMN IF NOT EXISTS "companyId" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) DEFAULT 'Active';

-- Drop old code-only unique constraint if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Designation_code_key') THEN
    ALTER TABLE "Designation" DROP CONSTRAINT "Designation_code_key";
  END IF;
END $$;

-- Add new unique index on companyId + code
CREATE UNIQUE INDEX IF NOT EXISTS "Designation_companyId_code_key" ON "Designation"("companyId", "code");

-- Add indexes for company-scoped lookups
CREATE INDEX IF NOT EXISTS "Designation_companyId_idx" ON "Designation"("companyId");
CREATE INDEX IF NOT EXISTS "Designation_companyId_status_idx" ON "Designation"("companyId", "status");

-- Add foreign key from Designation to Company
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Designation_companyId_fkey') THEN
    ALTER TABLE "Designation"
      ADD CONSTRAINT "Designation_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;