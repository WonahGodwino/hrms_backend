-- Demo requests captured from the public Request Demo page.
-- Additive and non-destructive: creates a new table used by SUPER_ADMIN follow-up workflows.

CREATE TABLE IF NOT EXISTS "demo_requests" (
  "id" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "workEmail" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "jobTitle" TEXT NOT NULL,
  "companySize" TEXT NOT NULL,
  "modules" JSONB NOT NULL,
  "currentHRSystem" TEXT NOT NULL,
  "message" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NOT_CONTACTED',
  "outcomeNote" TEXT,
  "outcomeUpdatedBy" TEXT,
  "outcomeUpdatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "demo_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "demo_requests_status_createdAt_idx"
  ON "demo_requests"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "demo_requests_workEmail_idx"
  ON "demo_requests"("workEmail");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'demo_requests_status_check'
  ) THEN
    ALTER TABLE "demo_requests"
      ADD CONSTRAINT "demo_requests_status_check"
      CHECK ("status" IN ('NOT_CONTACTED', 'CONTACTED', 'REJECTED_USAGE', 'USING_APP_NOW'));
  END IF;
END $$;
