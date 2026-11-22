-- S3 migration runner tables (SUPER_ADMIN-triggered background migration).
-- Additive and non-destructive.

CREATE TABLE IF NOT EXISTS "s3_migration_jobs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "currentSection" TEXT,
    "error" TEXT,
    "createdBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "s3_migration_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "s3_migration_sections" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "s3_migration_sections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "s3_migration_jobs_status_createdAt_idx" ON "s3_migration_jobs"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "s3_migration_sections_jobId_idx" ON "s3_migration_sections"("jobId");
