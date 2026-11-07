-- Migration: 20261106130000_designation_seniority_pay_bands
--
-- Resolves the Designation schema/DB drift. The Prisma model carries seniority
-- and pay-band fields (Workaround A: Designation embeds seniority & pay bands,
-- replacing standalone GradeLevel), but these were only ever in schema.prisma —
-- no migration added them to the "Designation" table, so any query selecting
-- them fails. This catches the database up to the model.
--
-- Additive, nullable/defaulted and idempotent (IF NOT EXISTS), so existing rows
-- are untouched and it is safe to run against production.

-- 1) Seniority band enum (only BasePayFrequency existed before).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SeniorityBand') THEN
    CREATE TYPE "SeniorityBand" AS ENUM ('ENTRY', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'EXECUTIVE', 'DIRECTOR');
  END IF;
END $$;

-- 2) Seniority & pay-band columns on Designation.
--    rank/seniorityBand are NOT NULL with defaults, so existing rows backfill
--    automatically; minSalary/maxSalary stay nullable.
ALTER TABLE "Designation"
  ADD COLUMN IF NOT EXISTS "rank" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "seniorityBand" "SeniorityBand" NOT NULL DEFAULT 'MID',
  ADD COLUMN IF NOT EXISTS "minSalary" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "maxSalary" DECIMAL(18,2);

-- 3) Company-scoped lookup indexes declared on the model.
CREATE INDEX IF NOT EXISTS "Designation_companyId_rank_idx" ON "Designation"("companyId", "rank");
CREATE INDEX IF NOT EXISTS "Designation_companyId_seniorityBand_idx" ON "Designation"("companyId", "seniorityBand");
