-- Add missing banking & statutory snapshot columns to phed_computed_payrolls
-- These columns exist in the Prisma schema but were not included in previous migrations.
-- All are nullable — completely safe for production.

ALTER TABLE "phed_computed_payrolls"
  ADD COLUMN IF NOT EXISTS "bankName"      TEXT,
  ADD COLUMN IF NOT EXISTS "accountNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "accountName"   TEXT,
  ADD COLUMN IF NOT EXISTS "pfaName"       TEXT,
  ADD COLUMN IF NOT EXISTS "rsaPin"        TEXT,
  ADD COLUMN IF NOT EXISTS "pensionNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "tin"           TEXT,
  ADD COLUMN IF NOT EXISTS "nhfNumber"     TEXT;
