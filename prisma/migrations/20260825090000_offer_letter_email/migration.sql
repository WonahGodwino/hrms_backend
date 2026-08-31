-- Additive schema for the Offer Letter email delivery feature.
-- Applied via `prisma db execute --file`, matching this project's
-- established convention (not `migrate dev`/`db push`).

DO $$ BEGIN
  CREATE TYPE "OfferLetterEmailDirection" AS ENUM ('OUTBOUND', 'INBOUND');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "OfferLetterEmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "OfferLetterAttachmentSource" AS ENUM ('SYSTEM_LETTER', 'USER_UPLOADED', 'CANDIDATE_REPLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "offer_letter_email_templates" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "ccEmails" JSONB,
  "bccEmails" JSONB,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "signatureHtml" TEXT,
  "autoAttachLetter" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "offer_letter_email_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "offer_letter_emails" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "letterId" TEXT NOT NULL,
  "templateId" TEXT,
  "parentEmailId" TEXT,
  "direction" "OfferLetterEmailDirection" NOT NULL,
  "fromEmail" TEXT NOT NULL,
  "fromName" TEXT NOT NULL,
  "toEmail" TEXT NOT NULL,
  "toName" TEXT NOT NULL,
  "ccEmails" JSONB,
  "bccEmails" JSONB,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "OfferLetterEmailStatus" NOT NULL DEFAULT 'PENDING',
  "messageId" TEXT,
  "inReplyTo" TEXT,
  "errorMessage" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "offer_letter_emails_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "offer_letter_email_attachments" (
  "id" TEXT NOT NULL,
  "emailId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileData" BYTEA NOT NULL,
  "source" "OfferLetterAttachmentSource" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offer_letter_email_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "offer_letter_mailbox_messages" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "folder" TEXT NOT NULL DEFAULT 'INBOX',
  "uid" TEXT,
  "fingerprint" TEXT NOT NULL,
  "direction" "OfferLetterEmailDirection" NOT NULL DEFAULT 'INBOUND',
  "messageId" TEXT,
  "inReplyTo" TEXT,
  "references" JSONB,
  "fromEmail" TEXT NOT NULL,
  "fromName" TEXT,
  "toEmails" JSONB,
  "ccEmails" JSONB,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "rawHeaders" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "linkedEmailId" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "offer_letter_mailbox_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "offer_letter_mailbox_attachments" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileData" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offer_letter_mailbox_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "offer_letter_unmatched_replies" (
  "id" TEXT NOT NULL,
  "messageId" TEXT,
  "fromEmail" TEXT NOT NULL,
  "fromName" TEXT,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "rawHeaders" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "linkedEmailId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offer_letter_unmatched_replies_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "offer_letter_unmatched_replies" ADD COLUMN IF NOT EXISTS "messageId" TEXT;

CREATE INDEX IF NOT EXISTS "offer_letter_email_templates_companyId_isActive_idx" ON "offer_letter_email_templates"("companyId", "isActive");
CREATE INDEX IF NOT EXISTS "offer_letter_emails_companyId_letterId_idx" ON "offer_letter_emails"("companyId", "letterId");
CREATE INDEX IF NOT EXISTS "offer_letter_emails_messageId_idx" ON "offer_letter_emails"("messageId");
CREATE UNIQUE INDEX IF NOT EXISTS "offer_letter_mailbox_messages_fingerprint_key" ON "offer_letter_mailbox_messages"("fingerprint");
CREATE INDEX IF NOT EXISTS "offer_letter_mailbox_messages_companyId_receivedAt_idx" ON "offer_letter_mailbox_messages"("companyId", "receivedAt");
CREATE INDEX IF NOT EXISTS "offer_letter_mailbox_messages_messageId_idx" ON "offer_letter_mailbox_messages"("messageId");
CREATE INDEX IF NOT EXISTS "offer_letter_mailbox_messages_folder_uid_idx" ON "offer_letter_mailbox_messages"("folder", "uid");
CREATE INDEX IF NOT EXISTS "offer_letter_mailbox_attachments_messageId_idx" ON "offer_letter_mailbox_attachments"("messageId");
CREATE INDEX IF NOT EXISTS "offer_letter_unmatched_replies_messageId_idx" ON "offer_letter_unmatched_replies"("messageId");

DO $$ BEGIN
  ALTER TABLE "offer_letter_email_templates" ADD CONSTRAINT "offer_letter_email_templates_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "offer_letter_emails" ADD CONSTRAINT "offer_letter_emails_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "offer_letter_mailbox_messages" ADD CONSTRAINT "offer_letter_mailbox_messages_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "offer_letter_mailbox_messages" ADD CONSTRAINT "offer_letter_mailbox_messages_linkedEmailId_fkey"
    FOREIGN KEY ("linkedEmailId") REFERENCES "offer_letter_emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "offer_letter_mailbox_attachments" ADD CONSTRAINT "offer_letter_mailbox_attachments_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "offer_letter_mailbox_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "offer_letter_emails" ADD CONSTRAINT "offer_letter_emails_letterId_fkey"
    FOREIGN KEY ("letterId") REFERENCES "generated_offer_letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "offer_letter_emails" ADD CONSTRAINT "offer_letter_emails_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "offer_letter_email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "offer_letter_email_attachments" ADD CONSTRAINT "offer_letter_email_attachments_emailId_fkey"
    FOREIGN KEY ("emailId") REFERENCES "offer_letter_emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
