-- Add missing columns to phed_staff that exist in the Prisma schema
-- but were not included in any previous migration.
-- All columns are nullable — completely safe for production.

ALTER TABLE "phed_staff"
  ADD COLUMN IF NOT EXISTS "jobTitle"       TEXT,
  ADD COLUMN IF NOT EXISTS "level"          TEXT,
  ADD COLUMN IF NOT EXISTS "resumptionDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "callCenter"     TEXT,
  ADD COLUMN IF NOT EXISTS "nhfNumber"      TEXT,
  ADD COLUMN IF NOT EXISTS "cashAdvanced"   DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "loan"           DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "domesticLoan"   DECIMAL(18,2);
