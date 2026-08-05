-- PHED role page-access matrix: safe, idempotent production provisioning.
-- Creates only the new enum/table/indexes/key, then adds missing default
-- access grants. Existing grants and role assignments are never changed.

DO $$ BEGIN
    CREATE TYPE "PhedPageKey" AS ENUM (
        'BANK_PAGE',
        'PENSION_SCHEDULE',
        'PAYE_SCHEDULE',
        'NSITF_SCHEDULE',
        'ITF_SCHEDULE',
        'NHF_SCHEDULE',
        'UNIONS_COOPERATIVES_DEDUCTIONS',
        'LIABILITIES_TO_PHED',
        'COST_CENTRE_REPORT',
        'IAD_SUMMARY',
        'IAD_CHANGES',
        'IAD_EXITED',
        'IAD_NEW_HIRED'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "phed_role_access_grants" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accessRole" "PhedAccessRole" NOT NULL,
    "pageKey" "PhedPageKey" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "phed_role_access_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "phed_role_access_grants_companyId_accessRole_pageKey_key"
  ON "phed_role_access_grants"("companyId", "accessRole", "pageKey");
CREATE INDEX IF NOT EXISTS "phed_role_access_grants_companyId_accessRole_idx"
  ON "phed_role_access_grants"("companyId", "accessRole");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'phed_role_access_grants_companyId_fkey') THEN
        ALTER TABLE "phed_role_access_grants"
          ADD CONSTRAINT "phed_role_access_grants_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE;
    END IF;
END $$;

-- The deterministic ID makes this insert repeatable without requiring an
-- extension. ON CONFLICT preserves any existing company-specific grants.
INSERT INTO "phed_role_access_grants" ("id", "companyId", "accessRole", "pageKey")
SELECT
  'phed-grant-' || md5(company."id" || ':' || matrix."accessRole"::text || ':' || matrix."pageKey"::text),
  company."id",
  matrix."accessRole",
  matrix."pageKey"
FROM "companies" AS company
CROSS JOIN (
  VALUES
    ('MANAGER_COMP_BENEFITS'::"PhedAccessRole", 'BANK_PAGE'::"PhedPageKey"),
    ('MANAGER_COMP_BENEFITS'::"PhedAccessRole", 'PENSION_SCHEDULE'::"PhedPageKey"),
    ('MANAGER_COMP_BENEFITS'::"PhedAccessRole", 'PAYE_SCHEDULE'::"PhedPageKey"),
    ('MANAGER_COMP_BENEFITS'::"PhedAccessRole", 'NSITF_SCHEDULE'::"PhedPageKey"),
    ('MANAGER_COMP_BENEFITS'::"PhedAccessRole", 'ITF_SCHEDULE'::"PhedPageKey"),
    ('MANAGER_COMP_BENEFITS'::"PhedAccessRole", 'NHF_SCHEDULE'::"PhedPageKey"),
    ('MANAGER_COMP_BENEFITS'::"PhedAccessRole", 'UNIONS_COOPERATIVES_DEDUCTIONS'::"PhedPageKey"),
    ('MANAGER_COMP_BENEFITS'::"PhedAccessRole", 'LIABILITIES_TO_PHED'::"PhedPageKey"),
    ('MANAGER_COMP_BENEFITS'::"PhedAccessRole", 'COST_CENTRE_REPORT'::"PhedPageKey"),
    ('MANAGER_COMP_BENEFITS'::"PhedAccessRole", 'IAD_SUMMARY'::"PhedPageKey"),
    ('MANAGER_COMP_BENEFITS'::"PhedAccessRole", 'IAD_CHANGES'::"PhedPageKey"),
    ('MANAGER_COMP_BENEFITS'::"PhedAccessRole", 'IAD_EXITED'::"PhedPageKey"),
    ('MANAGER_COMP_BENEFITS'::"PhedAccessRole", 'IAD_NEW_HIRED'::"PhedPageKey"),
    ('CHIEF_PEOPLE_OFFICER'::"PhedAccessRole", 'BANK_PAGE'::"PhedPageKey"),
    ('CHIEF_PEOPLE_OFFICER'::"PhedAccessRole", 'PENSION_SCHEDULE'::"PhedPageKey"),
    ('CHIEF_PEOPLE_OFFICER'::"PhedAccessRole", 'PAYE_SCHEDULE'::"PhedPageKey"),
    ('CHIEF_PEOPLE_OFFICER'::"PhedAccessRole", 'NSITF_SCHEDULE'::"PhedPageKey"),
    ('CHIEF_PEOPLE_OFFICER'::"PhedAccessRole", 'ITF_SCHEDULE'::"PhedPageKey"),
    ('CHIEF_PEOPLE_OFFICER'::"PhedAccessRole", 'NHF_SCHEDULE'::"PhedPageKey"),
    ('CHIEF_PEOPLE_OFFICER'::"PhedAccessRole", 'UNIONS_COOPERATIVES_DEDUCTIONS'::"PhedPageKey"),
    ('CHIEF_PEOPLE_OFFICER'::"PhedAccessRole", 'LIABILITIES_TO_PHED'::"PhedPageKey"),
    ('CHIEF_PEOPLE_OFFICER'::"PhedAccessRole", 'COST_CENTRE_REPORT'::"PhedPageKey"),
    ('CHIEF_PEOPLE_OFFICER'::"PhedAccessRole", 'IAD_SUMMARY'::"PhedPageKey"),
    ('CHIEF_PEOPLE_OFFICER'::"PhedAccessRole", 'IAD_CHANGES'::"PhedPageKey"),
    ('CHIEF_PEOPLE_OFFICER'::"PhedAccessRole", 'IAD_EXITED'::"PhedPageKey"),
    ('CHIEF_PEOPLE_OFFICER'::"PhedAccessRole", 'IAD_NEW_HIRED'::"PhedPageKey"),
    ('CHIEF_FINANCE_OFFICER'::"PhedAccessRole", 'BANK_PAGE'::"PhedPageKey"),
    ('CHIEF_FINANCE_OFFICER'::"PhedAccessRole", 'PENSION_SCHEDULE'::"PhedPageKey"),
    ('CHIEF_FINANCE_OFFICER'::"PhedAccessRole", 'PAYE_SCHEDULE'::"PhedPageKey"),
    ('CHIEF_FINANCE_OFFICER'::"PhedAccessRole", 'NSITF_SCHEDULE'::"PhedPageKey"),
    ('CHIEF_FINANCE_OFFICER'::"PhedAccessRole", 'ITF_SCHEDULE'::"PhedPageKey"),
    ('CHIEF_FINANCE_OFFICER'::"PhedAccessRole", 'NHF_SCHEDULE'::"PhedPageKey"),
    ('CHIEF_FINANCE_OFFICER'::"PhedAccessRole", 'UNIONS_COOPERATIVES_DEDUCTIONS'::"PhedPageKey"),
    ('CHIEF_FINANCE_OFFICER'::"PhedAccessRole", 'LIABILITIES_TO_PHED'::"PhedPageKey"),
    ('CHIEF_FINANCE_OFFICER'::"PhedAccessRole", 'COST_CENTRE_REPORT'::"PhedPageKey"),
    ('CHIEF_FINANCE_OFFICER'::"PhedAccessRole", 'IAD_SUMMARY'::"PhedPageKey"),
    ('CHIEF_FINANCE_OFFICER'::"PhedAccessRole", 'IAD_CHANGES'::"PhedPageKey"),
    ('CHIEF_FINANCE_OFFICER'::"PhedAccessRole", 'IAD_EXITED'::"PhedPageKey"),
    ('CHIEF_FINANCE_OFFICER'::"PhedAccessRole", 'IAD_NEW_HIRED'::"PhedPageKey"),
    ('MD_CEO'::"PhedAccessRole", 'BANK_PAGE'::"PhedPageKey"),
    ('MD_CEO'::"PhedAccessRole", 'PENSION_SCHEDULE'::"PhedPageKey"),
    ('MD_CEO'::"PhedAccessRole", 'PAYE_SCHEDULE'::"PhedPageKey"),
    ('MD_CEO'::"PhedAccessRole", 'NSITF_SCHEDULE'::"PhedPageKey"),
    ('MD_CEO'::"PhedAccessRole", 'ITF_SCHEDULE'::"PhedPageKey"),
    ('MD_CEO'::"PhedAccessRole", 'NHF_SCHEDULE'::"PhedPageKey"),
    ('MD_CEO'::"PhedAccessRole", 'UNIONS_COOPERATIVES_DEDUCTIONS'::"PhedPageKey"),
    ('MD_CEO'::"PhedAccessRole", 'LIABILITIES_TO_PHED'::"PhedPageKey"),
    ('MD_CEO'::"PhedAccessRole", 'COST_CENTRE_REPORT'::"PhedPageKey"),
    ('MD_CEO'::"PhedAccessRole", 'IAD_SUMMARY'::"PhedPageKey"),
    ('MD_CEO'::"PhedAccessRole", 'IAD_CHANGES'::"PhedPageKey"),
    ('MD_CEO'::"PhedAccessRole", 'IAD_EXITED'::"PhedPageKey"),
    ('MD_CEO'::"PhedAccessRole", 'IAD_NEW_HIRED'::"PhedPageKey"),
    ('HEAD_INTERNAL_AUDIT'::"PhedAccessRole", 'IAD_SUMMARY'::"PhedPageKey"),
    ('HEAD_INTERNAL_AUDIT'::"PhedAccessRole", 'IAD_CHANGES'::"PhedPageKey"),
    ('HEAD_INTERNAL_AUDIT'::"PhedAccessRole", 'IAD_EXITED'::"PhedPageKey"),
    ('HEAD_INTERNAL_AUDIT'::"PhedAccessRole", 'IAD_NEW_HIRED'::"PhedPageKey"),
    ('TREASURY_TEAM'::"PhedAccessRole", 'BANK_PAGE'::"PhedPageKey"),
    ('TREASURY_TEAM'::"PhedAccessRole", 'PENSION_SCHEDULE'::"PhedPageKey"),
    ('TREASURY_TEAM'::"PhedAccessRole", 'PAYE_SCHEDULE'::"PhedPageKey"),
    ('TREASURY_TEAM'::"PhedAccessRole", 'NSITF_SCHEDULE'::"PhedPageKey"),
    ('TREASURY_TEAM'::"PhedAccessRole", 'ITF_SCHEDULE'::"PhedPageKey"),
    ('TREASURY_TEAM'::"PhedAccessRole", 'NHF_SCHEDULE'::"PhedPageKey"),
    ('TREASURY_TEAM'::"PhedAccessRole", 'UNIONS_COOPERATIVES_DEDUCTIONS'::"PhedPageKey"),
    ('TREASURY_TEAM'::"PhedAccessRole", 'LIABILITIES_TO_PHED'::"PhedPageKey"),
    ('FINANCIAL_REPORTING_TEAM'::"PhedAccessRole", 'COST_CENTRE_REPORT'::"PhedPageKey"),
    ('TAX_TEAM'::"PhedAccessRole", 'PAYE_SCHEDULE'::"PhedPageKey")
) AS matrix("accessRole", "pageKey")
ON CONFLICT ("companyId", "accessRole", "pageKey") DO NOTHING;