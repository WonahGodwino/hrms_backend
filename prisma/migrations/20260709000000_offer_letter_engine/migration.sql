-- Migration: 20260709000000_offer_letter_engine  (Phase 1)
-- Adds the data backbone for the multi-company offer letter engine:
--   * employer / legal-governance fields on companies
--   * per-role default employment terms on jobs
--   * the offer_templates table (company-scoped rich-text templates)
-- All changes are additive, nullable/defaulted, and idempotent (IF NOT EXISTS),
-- so this is safe to run against production without touching existing data.

-- 1) Employer + legal/governance details used to populate the offer letter.
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "secondedCompany"   TEXT,
  ADD COLUMN IF NOT EXISTS "hrRepName"         TEXT,
  ADD COLUMN IF NOT EXISTS "hrRepTitle"        TEXT,
  ADD COLUMN IF NOT EXISTS "communicationTool" TEXT,
  ADD COLUMN IF NOT EXISTS "governingLaw"      TEXT DEFAULT 'Laws of the Federal Republic of Nigeria',
  ADD COLUMN IF NOT EXISTS "arbitrationVenue"  TEXT DEFAULT 'Lagos';

-- 2) Default employment terms per job role (offers may override per-candidate).
ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "offerDefaults" JSONB;

-- 3) Company-scoped offer letter templates.
CREATE TABLE IF NOT EXISTS "offer_templates" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "bodyHtml"    TEXT NOT NULL,
  "sections"    JSONB,
  "variables"   JSONB,
  "status"      TEXT NOT NULL DEFAULT 'DRAFT',
  "isDefault"   BOOLEAN NOT NULL DEFAULT false,
  "createdBy"   TEXT,
  "updatedBy"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived"    INTEGER DEFAULT 0,
  CONSTRAINT "offer_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "offer_templates_companyId_status_idx"    ON "offer_templates"("companyId", "status");
CREATE INDEX IF NOT EXISTS "offer_templates_companyId_archived_idx"  ON "offer_templates"("companyId", "archived");
CREATE INDEX IF NOT EXISTS "offer_templates_companyId_isDefault_idx" ON "offer_templates"("companyId", "isDefault");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offer_templates_companyId_fkey') THEN
    ALTER TABLE "offer_templates"
      ADD CONSTRAINT "offer_templates_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
