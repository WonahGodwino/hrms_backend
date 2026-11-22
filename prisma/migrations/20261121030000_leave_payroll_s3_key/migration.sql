-- Additive, non-destructive: nullable s3Key for the last two bytea-backed
-- stores (leave-request attachments and payroll-upload originals).

ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "s3Key" TEXT;
ALTER TABLE "payroll_uploads" ADD COLUMN IF NOT EXISTS "s3Key" TEXT;
