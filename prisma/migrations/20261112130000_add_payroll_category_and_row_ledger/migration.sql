-- Payroll upload restructure, step 1 of N: schema only, no application code
-- reads these new columns yet, so this is a no-op for every existing
-- company's behavior.
--
-- payslipCategory (Payroll/Payslip) is added NULLABLE with NO DEFAULT —
-- every existing row keeps payslipCategory = NULL, forever. It is never
-- backfilled. This is deliberate: Postgres never considers two NULLs equal
-- in a UNIQUE constraint, so the new unique indexes below are automatically
-- invisible to all ~119k existing rows (many of which share the same
-- staffRecordId/month/year/companyId today) and cannot violate them. Only
-- NEW rows — written by the upcoming fixed processors, which will always
-- set a real category — are protected by the new constraint. Verified
-- empirically against a throwaway temp table before writing this migration.
--
-- category (PayrollTemplate) gets a real default ('SALARY') since it's just
-- template metadata, not a payroll/payslip row — existing templates are
-- safely labeled "SALARY" and nothing downstream reads this field yet.

-- AlterTable
ALTER TABLE "payrolls" ADD COLUMN     "payslipCategory" TEXT;

-- AlterTable
ALTER TABLE "payslips" ADD COLUMN     "payslipCategory" TEXT;

-- AlterTable
ALTER TABLE "payroll_uploads" ADD COLUMN     "fileData" BYTEA;

-- AlterTable
ALTER TABLE "payroll_templates" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'SALARY';

-- CreateTable
CREATE TABLE "payroll_upload_row_results" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "staffId" TEXT,
    "category" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_upload_row_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_upload_row_results_uploadId_status_idx" ON "payroll_upload_row_results"("uploadId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_upload_row_results_uploadId_rowIndex_key" ON "payroll_upload_row_results"("uploadId", "rowIndex");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_staffRecordId_month_year_companyId_payslipCategory_key" ON "payrolls"("staffRecordId", "month", "year", "companyId", "payslipCategory");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_staffRecordId_month_year_companyId_payslipCategory_key" ON "payslips"("staffRecordId", "month", "year", "companyId", "payslipCategory");

-- AddForeignKey
ALTER TABLE "payroll_upload_row_results" ADD CONSTRAINT "payroll_upload_row_results_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "payroll_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
