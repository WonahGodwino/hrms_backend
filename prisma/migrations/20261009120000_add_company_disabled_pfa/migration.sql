-- Per-company PFA opt-out. One new table: presence of a row means a given PFA
-- code is disabled for that company (absence means enabled, subject to the
-- PFA's own global isActive flag). See backend/src/app/lib/staff/pension-fields.ts.
-- No existing data is touched; this is purely additive.

CREATE TABLE IF NOT EXISTS "company_disabled_pfas" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "pfaCode" TEXT NOT NULL,
    "disabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledBy" TEXT,
    CONSTRAINT "company_disabled_pfas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_disabled_pfas_companyId_pfaCode_key"
    ON "company_disabled_pfas"("companyId", "pfaCode");

DO $$
BEGIN
    ALTER TABLE "company_disabled_pfas"
        ADD CONSTRAINT "company_disabled_pfas_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
