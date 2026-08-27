-- Tracks async payroll upload processing so the frontend can poll for
-- completion instead of blocking on the upload request. Existing rows were
-- only ever written after processing finished, so they backfill as COMPLETED.
CREATE TYPE "PayrollUploadStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "payroll_uploads" ADD COLUMN "status" "PayrollUploadStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "payroll_uploads" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "payroll_uploads" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "payroll_uploads" ADD COLUMN "completedAt" TIMESTAMP(3);

UPDATE "payroll_uploads" SET "status" = 'COMPLETED', "startedAt" = "createdAt", "completedAt" = "createdAt";

CREATE INDEX "payroll_uploads_companyId_status_idx" ON "payroll_uploads"("companyId", "status");
