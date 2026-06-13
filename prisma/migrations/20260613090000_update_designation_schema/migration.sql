-- AlterTable: Add companyId, status, description to designations
ALTER TABLE "designations" 
  ADD COLUMN IF NOT EXISTS "companyId" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) DEFAULT 'Active';

-- Add index for company-scoped lookups
CREATE INDEX IF NOT EXISTS "designations_companyId_idx" ON "designations"("companyId");
CREATE INDEX IF NOT EXISTS "designations_companyId_status_idx" ON "designations"("companyId", "status");