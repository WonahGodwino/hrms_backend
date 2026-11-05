-- Offboarding exit flow — additive only (no destructive changes, no data loss).
-- Hand-authored for the same shadow-database-drift reason documented in
-- 20260911120000_rebuild_loans_benefits; safe to apply with `prisma db execute`
-- directly against the real database. Run `prisma generate` afterwards so the
-- client picks up the new fields/enums.

-- ─── Enum additions (PostgreSQL ALTER TYPE ... ADD VALUE cannot run inside a
-- transaction block with prior usage of the type in the same session; applied
-- standalone it is safe. IF NOT EXISTS guard keeps re-runs idempotent.) ───
ALTER TYPE "OffboardingType" ADD VALUE IF NOT EXISTS 'RETIREMENT';
ALTER TYPE "OffboardingStatus" ADD VALUE IF NOT EXISTS 'NOTICE_PERIOD';

-- ─── New columns ───
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "lastWorkingDay" TIMESTAMP(3);
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "noticeDays" INTEGER;
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "compensationItems" JSONB;
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "finalPayPeriod" TEXT;
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "settlementInjected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "settlementPaidAt" TIMESTAMP(3);
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "exitCategory" TEXT;
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- ─── Indexes for the new access patterns ───
-- Upcoming-exits strip + processDueExits scheduler: "what exits fall on/before
-- today and still needs completing?"
CREATE INDEX IF NOT EXISTS "offboardings_lastWorkingDay_status_idx" ON "offboardings"("lastWorkingDay", "status");
-- Archive folders: completed exits by category per company
CREATE INDEX IF NOT EXISTS "offboardings_company_exitCategory_idx" ON "offboardings"("companyId", "exitCategory");
