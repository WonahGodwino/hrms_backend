-- DropIndex
DROP INDEX "application_stage_history_applicationId_idx";

-- DropIndex
DROP INDEX "candidate_documents_companyId_idx";

-- DropIndex
DROP INDEX "candidates_companyId_idx";

-- DropIndex
DROP INDEX "interviews_companyId_idx";

-- AlterTable
ALTER TABLE "application_stage_history" ADD COLUMN     "archived" INTEGER DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "candidate_documents" ADD COLUMN     "archived" INTEGER DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "candidate_files" ADD COLUMN     "archived" INTEGER DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "archived" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "archived" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "job_applications" ADD COLUMN     "archived" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "archived" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "keywords" ADD COLUMN     "archived" INTEGER DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "archived" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "onboarding_tasks" ADD COLUMN     "archived" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "onboardings" ADD COLUMN     "archived" INTEGER DEFAULT 0;

-- CreateIndex
CREATE INDEX "ai_settings_companyId_idx" ON "ai_settings"("companyId");

-- CreateIndex
CREATE INDEX "application_stage_history_applicationId_archived_idx" ON "application_stage_history"("applicationId", "archived");

-- CreateIndex
CREATE INDEX "candidate_documents_companyId_archived_idx" ON "candidate_documents"("companyId", "archived");

-- CreateIndex
CREATE INDEX "candidate_files_companyId_archived_idx" ON "candidate_files"("companyId", "archived");

-- CreateIndex
CREATE INDEX "candidates_companyId_archived_idx" ON "candidates"("companyId", "archived");

-- CreateIndex
CREATE INDEX "interviews_companyId_archived_idx" ON "interviews"("companyId", "archived");

-- CreateIndex
CREATE INDEX "job_applications_companyId_archived_idx" ON "job_applications"("companyId", "archived");

-- CreateIndex
CREATE INDEX "jobs_companyId_archived_idx" ON "jobs"("companyId", "archived");

-- CreateIndex
CREATE INDEX "keywords_jobId_archived_idx" ON "keywords"("jobId", "archived");

-- CreateIndex
CREATE INDEX "offers_companyId_archived_idx" ON "offers"("companyId", "archived");

-- CreateIndex
CREATE INDEX "onboarding_tasks_onboardingId_archived_idx" ON "onboarding_tasks"("onboardingId", "archived");

-- CreateIndex
CREATE INDEX "onboardings_companyId_archived_idx" ON "onboardings"("companyId", "archived");
