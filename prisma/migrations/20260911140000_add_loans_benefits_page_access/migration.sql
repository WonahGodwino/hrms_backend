-- Staff Loans & Benefits — department/designation access configuration.
-- One new table: per-company, per-page allow-list of Department/Designation
-- ids for the five governed admin pages (Financial Dashboard, Loan
-- Management, Loan Policy Config, Benefit Policy Config, Benefit
-- Allocation). A page with no row here is SUPER_ADMIN-only by design — see
-- backend/src/app/lib/staff-loans-benefits/page-access.ts. No existing data
-- is touched; this is purely additive.

CREATE TABLE IF NOT EXISTS "staff_loans_benefits_page_access" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "departmentIds" JSONB NOT NULL DEFAULT '[]',
    "designationIds" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "staff_loans_benefits_page_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_loans_benefits_page_access_companyId_pageKey_key"
    ON "staff_loans_benefits_page_access"("companyId", "pageKey");

DO $$
BEGIN
    ALTER TABLE "staff_loans_benefits_page_access"
        ADD CONSTRAINT "staff_loans_benefits_page_access_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
