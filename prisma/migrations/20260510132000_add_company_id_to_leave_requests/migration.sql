-- Add multi-tenant ownership to leave requests
ALTER TABLE "leave_requests" ADD COLUMN "companyId" TEXT;

-- Backfill existing rows from staff owner
UPDATE "leave_requests" lr
SET "companyId" = sr."companyId"
FROM "staff_records" sr
WHERE lr."staffRecordId" = sr."id"
  AND lr."companyId" IS NULL;

-- Enforce non-null after backfill
ALTER TABLE "leave_requests" ALTER COLUMN "companyId" SET NOT NULL;

-- Add tenant foreign key and index
ALTER TABLE "leave_requests"
ADD CONSTRAINT "leave_requests_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "leave_requests_companyId_idx" ON "leave_requests"("companyId");