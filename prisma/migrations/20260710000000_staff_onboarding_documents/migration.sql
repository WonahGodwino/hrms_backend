-- Migration: 20260710000000_staff_onboarding_documents
-- New table for the required onboarding documents a new hire (STAFF) uploads:
-- means of identification, guarantor form, and signed offer letter. Bytes are
-- stored in the DB; one row per (staff, category). Additive and idempotent.

CREATE TABLE IF NOT EXISTS "staff_onboarding_documents" (
  "id"         TEXT NOT NULL,
  "companyId"  TEXT NOT NULL,
  "staffId"    TEXT NOT NULL,
  "category"   TEXT NOT NULL,
  "fileName"   TEXT NOT NULL,
  "mimeType"   TEXT NOT NULL,
  "sizeBytes"  INTEGER NOT NULL,
  "data"       BYTEA NOT NULL,
  "uploadedBy" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_onboarding_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_onboarding_documents_staffId_category_key"
  ON "staff_onboarding_documents"("staffId", "category");
CREATE INDEX IF NOT EXISTS "staff_onboarding_documents_companyId_staffId_idx"
  ON "staff_onboarding_documents"("companyId", "staffId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_onboarding_documents_companyId_fkey') THEN
    ALTER TABLE "staff_onboarding_documents"
      ADD CONSTRAINT "staff_onboarding_documents_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_onboarding_documents_staffId_fkey') THEN
    ALTER TABLE "staff_onboarding_documents"
      ADD CONSTRAINT "staff_onboarding_documents_staffId_fkey"
      FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
