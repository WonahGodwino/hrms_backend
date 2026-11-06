-- CreateTable (idempotent: table may already exist where schema was pushed outside migrations)
CREATE TABLE IF NOT EXISTS "company_export_jobs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "domains" JSONB NOT NULL,
    "includeSensitiveData" BOOLEAN NOT NULL DEFAULT false,
    "attendanceFrom" TIMESTAMP(3),
    "attendanceTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "filePath" TEXT,
    "fileName" TEXT,
    "rowCounts" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "company_export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "company_export_jobs_companyId_idx" ON "company_export_jobs"("companyId");

-- AddForeignKey (guarded so re-applying after drift never fails)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'company_export_jobs'
          AND c.conname = 'company_export_jobs_companyId_fkey'
    ) THEN
        ALTER TABLE "company_export_jobs" ADD CONSTRAINT "company_export_jobs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
