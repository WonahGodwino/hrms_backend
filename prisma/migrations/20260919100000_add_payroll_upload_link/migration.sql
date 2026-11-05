-- Additive: link each Payroll row to the PayrollUpload that created/updated
-- it (null for generation-flow rows and pre-existing uploads, which fall
-- back to the upload's time window in report queries).
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "payrollUploadId" TEXT;

CREATE INDEX IF NOT EXISTS "payrolls_payrollUploadId_idx" ON "payrolls"("payrollUploadId");

ALTER TABLE "payrolls"
  ADD CONSTRAINT "payrolls_payrollUploadId_fkey"
  FOREIGN KEY ("payrollUploadId") REFERENCES "payroll_uploads"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
