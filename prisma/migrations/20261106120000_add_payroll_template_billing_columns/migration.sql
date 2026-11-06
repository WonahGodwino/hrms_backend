-- Add client-billing columns to payroll_templates.
-- These fields exist in schema.prisma but were never captured in a migration,
-- so production databases migrated before this point are missing them.
ALTER TABLE "payroll_templates"
  ADD COLUMN IF NOT EXISTS "payrollInvoicingEnabled"     BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "payrollManagementFeePercent" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "payrollVatPercent"           DECIMAL(5,2);
