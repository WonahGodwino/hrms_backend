-- Allow multiple payroll records per staff per month (overwrite toggle feature)
-- Drop the unique index on payrolls so multiple uploads per period are allowed when overwriteExisting=false
DROP INDEX "payrolls_staffRecordId_month_year_companyId_key";

-- Create a non-unique index to preserve query performance
CREATE INDEX "payrolls_staffRecordId_month_year_companyId_idx" ON "payrolls"("staffRecordId", "month", "year", "companyId");

-- Add overwriteExisting flag to payroll_uploads for audit trail
ALTER TABLE "payroll_uploads" ADD COLUMN "overwriteExisting" BOOLEAN NOT NULL DEFAULT false;
