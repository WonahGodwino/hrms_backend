-- Payslip object storage (S3): adds the S3 object key column.
--
-- Additive, idempotent, NON-destructive. The PDF bytes stay in "fileData" until
-- a verified backfill (scripts/migrate-payslips-to-s3.ts) uploads them to S3 and
-- sets "s3Key"; "fileData" is only nulled in a later, separately-approved step.
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "s3Key" TEXT;
