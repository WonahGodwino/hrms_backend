-- Recruitment — department/designation access configuration.
-- One new table: per-company, per-page allow-list of Department/Designation
-- ids for Recruitment admin pages. Unlike staff_loans_benefits_page_access,
-- a pageKey with no row here is UNRESTRICTED by design (opt-in scoping) —
-- see backend/src/app/lib/recruitment/page-access.ts. No existing data is
-- touched; this is purely additive.

CREATE TABLE IF NOT EXISTS "recruitment_page_access" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "departmentIds" JSONB NOT NULL DEFAULT '[]',
    "designationIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "recruitment_page_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "recruitment_page_access_companyId_pageKey_key"
    ON "recruitment_page_access"("companyId", "pageKey");

DO $$
BEGIN
    ALTER TABLE "recruitment_page_access"
        ADD CONSTRAINT "recruitment_page_access_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
