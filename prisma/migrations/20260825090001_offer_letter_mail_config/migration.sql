-- Additive schema for per-company Hostinger mailbox configuration, and the
-- accompanying loosening of offer_letter_bulk_jobs to support the new
-- EMAIL_SEND job type (which isn't scoped to a single Word template).
-- Applied via `prisma db execute --file`, matching this project's
-- established convention (not `migrate dev`/`db push`).

CREATE TABLE IF NOT EXISTS "offer_letter_mail_configs" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "fromName" TEXT NOT NULL,
  "smtpHost" TEXT NOT NULL DEFAULT 'smtp.hostinger.com',
  "smtpPort" INTEGER NOT NULL DEFAULT 465,
  "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
  "smtpUser" TEXT NOT NULL,
  "smtpPasswordEncrypted" TEXT NOT NULL,
  "imapHost" TEXT NOT NULL DEFAULT 'imap.hostinger.com',
  "imapPort" INTEGER NOT NULL DEFAULT 993,
  "imapUser" TEXT,
  "imapPasswordEncrypted" TEXT,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "lastVerifiedAt" TIMESTAMP(3),
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "offer_letter_mail_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "offer_letter_mail_configs_companyId_key" ON "offer_letter_mail_configs"("companyId");

DO $$ BEGIN
  ALTER TABLE "offer_letter_mail_configs" ADD CONSTRAINT "offer_letter_mail_configs_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- offer_letter_bulk_jobs: templateId/fileName become optional (EMAIL_SEND
-- jobs aren't scoped to one Word template or an uploaded sheet), and a new
-- payload column carries job-type-specific input (e.g. the selected
-- letterIds + email template for an EMAIL_SEND job).
ALTER TABLE "offer_letter_bulk_jobs" ALTER COLUMN "templateId" DROP NOT NULL;
ALTER TABLE "offer_letter_bulk_jobs" ALTER COLUMN "fileName" DROP NOT NULL;
ALTER TABLE "offer_letter_bulk_jobs" ADD COLUMN IF NOT EXISTS "payload" JSONB;

DO $$ BEGIN
  ALTER TYPE "OfferLetterBulkJobType" ADD VALUE IF NOT EXISTS 'EMAIL_SEND';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
