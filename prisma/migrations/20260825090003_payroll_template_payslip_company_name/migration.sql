ALTER TABLE "payroll_templates" ADD COLUMN IF NOT EXISTS "payslipCompanyName" TEXT;

-- Backfill existing Dynamic templates so they don't go blank on next upload —
-- one-time copy of the company's current name, editable afterward from the
-- template builder. System templates (isSystem = true) are left untouched
-- since they have no edit UI and keep reading Company.companyName directly.
UPDATE "payroll_templates" pt
SET "payslipCompanyName" = c."companyName"
FROM "companies" c
WHERE pt."companyId" = c.id
  AND pt."payslipCompanyName" IS NULL
  AND pt."isSystem" = false;
