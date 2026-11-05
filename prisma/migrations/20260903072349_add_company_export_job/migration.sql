-- CreateTable
CREATE TABLE "company_export_jobs" (
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
CREATE INDEX "company_export_jobs_companyId_idx" ON "company_export_jobs"("companyId");

-- AddForeignKey
ALTER TABLE "company_export_jobs" ADD CONSTRAINT "company_export_jobs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
