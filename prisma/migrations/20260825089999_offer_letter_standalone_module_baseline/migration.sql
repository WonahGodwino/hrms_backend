-- Baseline for the standalone Offer Letter module (OfferLetterTemplate /
-- GeneratedOfferLetter / OfferLetterBulkJob) — independent of the
-- recruitment Offer/OfferTemplate system. Hand-authored (not via `prisma
-- migrate dev`) for the same shadow-database-drift reason documented in
-- 20260629094522_baseline_offboardings_table: these three tables were
-- created directly against the real database (no artifact of that change
-- exists at all — not even a loose SQL file like the recruitment one), so
-- replaying history from scratch fails the moment
-- 20260825090000_offer_letter_email references `generated_offer_letters`
-- and 20260825090001_offer_letter_mail_config ALTERs `offer_letter_bulk_jobs`.
--
-- Fully idempotent (CREATE TABLE IF NOT EXISTS with inline FK constraints,
-- DO-block enum guards) — a no-op against the real database, where all of
-- this already exists.
--
-- Columns match the tables' state immediately before 20260825090001, which
-- is the first migration to alter them: `jobType` only has CREATE/EDIT
-- (EMAIL_SEND is added later via `ALTER TYPE ... ADD VALUE IF NOT EXISTS`),
-- and `templateId`/`fileName` on offer_letter_bulk_jobs are NOT NULL with no
-- `payload` column yet (that migration loosens/adds them).

DO $$ BEGIN
  CREATE TYPE "OfferLetterBulkJobType" AS ENUM ('CREATE', 'EDIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "OfferLetterBulkJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── offer_letter_templates ───
CREATE TABLE IF NOT EXISTS "offer_letter_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "originalFileName" TEXT NOT NULL,
    "fileData" BYTEA NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "variables" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archived" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "offer_letter_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "offer_letter_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "offer_letter_templates_companyId_archived_idx" ON "offer_letter_templates"("companyId", "archived");

-- ─── generated_offer_letters ───
CREATE TABLE IF NOT EXISTS "generated_offer_letters" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "variableValues" JSONB NOT NULL,
    "fileData" BYTEA NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "generated_offer_letters_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "generated_offer_letters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "generated_offer_letters_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "offer_letter_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "generated_offer_letters_companyId_year_month_idx" ON "generated_offer_letters"("companyId", "year", "month");
CREATE INDEX IF NOT EXISTS "generated_offer_letters_companyId_createdAt_idx" ON "generated_offer_letters"("companyId", "createdAt");

-- ─── offer_letter_bulk_jobs ───
CREATE TABLE IF NOT EXISTS "offer_letter_bulk_jobs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobType" "OfferLetterBulkJobType" NOT NULL,
    "templateId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "successful" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "uploadedBy" TEXT NOT NULL,
    "status" "OfferLetterBulkJobStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "offer_letter_bulk_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "offer_letter_bulk_jobs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "offer_letter_bulk_jobs_companyId_status_idx" ON "offer_letter_bulk_jobs"("companyId", "status");
