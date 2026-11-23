-- Repair (owner-approved 2026-11-18): production records migrations
-- 20260917120000_offboarding_exit_flow and 20260917140000_add_offboarding_reason
-- as applied, but their columns and indexes were never created there
-- (found with a read-only comparison of production against the schema).
-- `prisma migrate deploy` never re-runs a migration it considers applied, so
-- this repeats their table changes. Every statement is guarded with
-- IF NOT EXISTS: it only adds what is missing and is a no-op on a database
-- where the earlier migrations did run. Additive and nullable (one boolean
-- with a default); no existing data is changed. The enum values those
-- migrations added (RETIREMENT, NOTICE_PERIOD) already exist in production.

-- ─── Columns from 20260917120000_offboarding_exit_flow ───
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "lastWorkingDay" TIMESTAMP(3);
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "noticeDays" INTEGER;
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "compensationItems" JSONB;
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "finalPayPeriod" TEXT;
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "settlementInjected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "settlementPaidAt" TIMESTAMP(3);
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "exitCategory" TEXT;
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- ─── Column from 20260917140000_add_offboarding_reason ───
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "reason" TEXT;

-- ─── Indexes from 20260917120000_offboarding_exit_flow ───
CREATE INDEX IF NOT EXISTS "offboardings_lastWorkingDay_status_idx" ON "offboardings"("lastWorkingDay", "status");
CREATE INDEX IF NOT EXISTS "offboardings_company_exitCategory_idx" ON "offboardings"("companyId", "exitCategory");
