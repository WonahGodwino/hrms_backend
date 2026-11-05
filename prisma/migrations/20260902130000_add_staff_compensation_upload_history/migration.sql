-- Staff Compensation upload history — additive only, nothing existing is
-- altered. Hand-authored (not via `prisma migrate dev`) for the same reason
-- as the payroll-generation-module migration before it: this repo's shadow-
-- database replay currently fails on an unrelated pre-existing migration
-- history conflict, out of scope here. Follows the same `IF NOT EXISTS`
-- idempotent style already used elsewhere in this migrations folder, and is
-- safe to apply with `prisma migrate deploy`.

-- One row per Staff Compensation Upload submission — an audit trail so HR
-- can look back at what was uploaded and re-download the original file.
-- Doesn't drive anything itself: StaffPayrollProfile.values stays the live
-- data Payroll Generation reads, regardless of whether this history exists.
CREATE TABLE IF NOT EXISTS "staff_compensation_uploads" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "totalRecords" INTEGER NOT NULL,
    "successful" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "errors" JSONB,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_compensation_uploads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "staff_compensation_uploads_companyId_createdAt_idx" ON "staff_compensation_uploads"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "staff_compensation_uploads_templateId_idx" ON "staff_compensation_uploads"("templateId");

DO $$ BEGIN
  ALTER TABLE "staff_compensation_uploads" ADD CONSTRAINT "staff_compensation_uploads_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "staff_compensation_uploads" ADD CONSTRAINT "staff_compensation_uploads_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "payroll_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
