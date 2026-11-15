-- Retroactive fix for a migration-history gap, unrelated to any feature work.
-- "payslip_bulk_sends" (and its enum "PayslipBulkSendStatus") exist in every
-- real environment today, but no tracked migration ever created them — they
-- were added out-of-band at some point, and migration
-- 20261110000000_payroll_scale_indexes_and_email_status later assumed the
-- table already existed (it only ALTERs it, never creates it). Replaying the
-- full migration history from scratch (shadow-DB validation, CI, disaster
-- recovery, a fresh environment) fails at that ALTER without this file.
--
-- Fully idempotent: on every environment where the table/enum already exist
-- (every real environment as of this writing), this is a safe no-op.

DO $$ BEGIN
  CREATE TYPE "PayslipBulkSendStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "payslip_bulk_sends" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "totalPayslips" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "emailFailures" JSONB,
    "status" "PayslipBulkSendStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "triggeredBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_bulk_sends_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payslip_bulk_sends_companyId_status_idx" ON "payslip_bulk_sends"("companyId", "status");

DO $$ BEGIN
  ALTER TABLE "payslip_bulk_sends" ADD CONSTRAINT "payslip_bulk_sends_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
