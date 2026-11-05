-- Baseline for the `offboardings` table and its enums.
-- Hand-authored (not via `prisma migrate dev`) for the same
-- shadow-database-drift reason documented in 20260911120000_rebuild_loans_benefits
-- and 20260917120000_offboarding_exit_flow: the table was created directly
-- against the real database at some point, so no migration in this folder
-- ever contained its CREATE TABLE. Replaying the full migration history from
-- scratch (shadow DB, CI, a future prod restore) therefore fails at
-- 20260629094523_offboarding_schema_updated with P1014 ("the underlying
-- table ... does not exist"), because that migration ALTERs a table that,
-- as far as tracked history is concerned, was never created.
--
-- This migration is fully idempotent (IF NOT EXISTS / duplicate_object
-- guards everywhere) so it is safe to apply against the real database too:
-- there it is a complete no-op (table and enums already exist), it just
-- fills the gap in tracked history so `prisma migrate deploy` on a fresh
-- environment (new prod, CI, disaster recovery) builds the same schema
-- without erroring.
--
-- Columns/enum values match the table's state immediately before
-- 20260629094523 ran; later migrations (20260629094523 onward) layer their
-- changes on top exactly as they did historically.

DO $$ BEGIN
  CREATE TYPE "OffboardingType" AS ENUM ('RESIGNATION', 'TERMINATION');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OffboardingStatus" AS ENUM ('PENDING_REVIEW', 'HANDOVER_REQUESTED', 'HANDOVER_SUBMITTED', 'COMPLETED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "InitiatedBy" AS ENUM ('STAFF', 'HR');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "offboardings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "type" "OffboardingType" NOT NULL,
    "status" "OffboardingStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "initiatedBy" "InitiatedBy" NOT NULL,
    "resignationLetter" TEXT,
    "resignationComment" TEXT,
    "handoverRequired" BOOLEAN NOT NULL DEFAULT true,
    "handoverDocument" TEXT,
    "handoverSubmittedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "offboardings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "offboardings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "offboardings_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "offboardings_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "offboardings_companyId_staffId_status_key" ON "offboardings"("companyId", "staffId", "status");
CREATE INDEX IF NOT EXISTS "offboardings_companyId_status_idx" ON "offboardings"("companyId", "status");
CREATE INDEX IF NOT EXISTS "offboardings_companyId_type_idx" ON "offboardings"("companyId", "type");
CREATE INDEX IF NOT EXISTS "offboardings_staffId_idx" ON "offboardings"("staffId");
CREATE INDEX IF NOT EXISTS "offboardings_createdAt_idx" ON "offboardings"("createdAt");
