-- Payroll scale: indexes, per-payslip email status, job heartbeat.
--
-- Supports 1,000-3,000 staff payroll uploads and email sends.
--   A. Indexes for the company/period queries used by duplicate detection, bulk
--      send, reporting and cancel cleanup (payslips had none on companyId).
--   B. Per-payslip email status so a crashed bulk send can resume and the
--      Mailgun delivery webhook can match events by message id.
--   C. A heartbeat column so stalled-job detection works across multiple server
--      instances (the heartbeat used to live in memory, single process only).
--
-- Additive and idempotent (IF NOT EXISTS). New columns are NULLable with no
-- default, so Postgres adds them without rewriting the tables. Index names
-- match what Prisma generates from schema.prisma, so there is no drift.
--
-- Locking note: plain CREATE INDEX blocks writes to the table while it builds,
-- and Prisma runs a migration as one script, which rules out CONCURRENTLY.
-- On a large production `payslips` table (PDF bytes are stored inline) apply
-- in a quiet window, or create these indexes by hand with CONCURRENTLY first
-- using the same names; IF NOT EXISTS then makes this a no-op for them.

-- A. Indexes
CREATE INDEX IF NOT EXISTS "payslips_companyId_year_month_idx" ON "payslips"("companyId", "year", "month");
CREATE INDEX IF NOT EXISTS "payslips_companyId_month_year_draft_idx" ON "payslips"("companyId", "month", "year", "draft");
CREATE INDEX IF NOT EXISTS "payslips_payrollId_idx" ON "payslips"("payrollId");
CREATE INDEX IF NOT EXISTS "EmailLog_companyId_status_createdAt_idx" ON "EmailLog"("companyId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailLog_emailType_createdAt_idx" ON "EmailLog"("emailType", "createdAt");
CREATE INDEX IF NOT EXISTS "payroll_uploads_companyId_createdAt_idx" ON "payroll_uploads"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "notifications_userId_read_createdAt_idx" ON "notifications"("userId", "read", "createdAt");

-- B. Per-payslip email status
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "emailStatus" TEXT;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "emailSentAt" TIMESTAMP(3);
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "emailMessageId" TEXT;
CREATE INDEX IF NOT EXISTS "payslips_emailMessageId_idx" ON "payslips"("emailMessageId");

-- C. Job heartbeat
ALTER TABLE "payroll_uploads" ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMP(3);
ALTER TABLE "payslip_bulk_sends" ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMP(3);
