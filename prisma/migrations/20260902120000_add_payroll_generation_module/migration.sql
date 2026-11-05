-- Payroll Generation module — additive only, nothing existing is altered.
-- Hand-authored (not via `prisma migrate dev`) because this repo's shadow-
-- database replay currently fails on an unrelated pre-existing migration
-- (20260524200411_add_loans_and_benefits re-creates the already-created
-- "LoanType" enum from 20260511104900_add_loans_benefits_models without an
-- idempotency guard) — a drift issue that predates this change and is out of
-- scope here. This file follows the same `IF NOT EXISTS` idempotent style
-- already used elsewhere in this migrations folder, and is safe to apply
-- with `prisma migrate deploy` (which applies pending migrations directly
-- and does not use a shadow database, so it isn't affected by that issue).

-- New columns on payroll_template_fields: how Payroll Generation should
-- resolve this field's value instead of reading it from an uploaded cell.
-- Every existing row defaults to 'MANUAL', which is exactly today's
-- behavior — the untouched upload path never reads these columns at all.
ALTER TABLE "payroll_template_fields" ADD COLUMN IF NOT EXISTS "valueSource" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "payroll_template_fields" ADD COLUMN IF NOT EXISTS "formulaConfig" JSONB;

-- New columns on payroll_data — this table already existed but was never
-- written to by any code path (confirmed before writing this migration).
-- Payroll Generation is the first feature to use it, as a draft-review
-- staging table before a run is approved into real payroll/payslip rows.
ALTER TABLE "payroll_data" ADD COLUMN IF NOT EXISTS "generatedBy" TEXT;
ALTER TABLE "payroll_data" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;
ALTER TABLE "payroll_data" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "payroll_data" ADD COLUMN IF NOT EXISTS "payrollId" TEXT;

-- New column on payrolls — 'UPLOAD' for every existing row and every row the
-- untouched manual upload path continues to create; 'GENERATED' only for
-- rows finalized by the new Payroll Generation flow. Audit/traceability
-- only, doesn't change how any existing code reads a row.
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'UPLOAD';

-- Recurring compensation baseline per staff member (Basic/Housing/Transport/
-- etc. that barely change month to month), keyed by the same systemField
-- convention as Payroll.customFields.
CREATE TABLE IF NOT EXISTS "staff_payroll_profiles" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_payroll_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_payroll_profiles_staffId_key" ON "staff_payroll_profiles"("staffId");
CREATE INDEX IF NOT EXISTS "staff_payroll_profiles_companyId_idx" ON "staff_payroll_profiles"("companyId");
CREATE INDEX IF NOT EXISTS "staff_payroll_profiles_templateId_idx" ON "staff_payroll_profiles"("templateId");

DO $$ BEGIN
  ALTER TABLE "staff_payroll_profiles" ADD CONSTRAINT "staff_payroll_profiles_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "staff_payroll_profiles" ADD CONSTRAINT "staff_payroll_profiles_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "staff_payroll_profiles" ADD CONSTRAINT "staff_payroll_profiles_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "payroll_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One row per "HR clicked Generate" — job/history record for a Payroll
-- Generation run, mirroring the existing payroll_uploads job-tracking
-- pattern used by the (untouched) manual upload flow.
CREATE TABLE IF NOT EXISTS "payroll_generation_runs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "payPeriod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "totalStaff" INTEGER NOT NULL,
    "flaggedCount" INTEGER NOT NULL DEFAULT 0,
    "triggeredBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_generation_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payroll_generation_runs_companyId_payPeriod_idx" ON "payroll_generation_runs"("companyId", "payPeriod");
CREATE INDEX IF NOT EXISTS "payroll_generation_runs_templateId_idx" ON "payroll_generation_runs"("templateId");

DO $$ BEGIN
  ALTER TABLE "payroll_generation_runs" ADD CONSTRAINT "payroll_generation_runs_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payroll_generation_runs" ADD CONSTRAINT "payroll_generation_runs_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "payroll_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
