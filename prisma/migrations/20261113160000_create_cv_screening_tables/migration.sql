-- CV Screening module (standalone) — purely additive: four new tables, no
-- changes to any existing table. Hand-written (not via `prisma migrate dev`)
-- because this database has unrelated pre-existing drift between its real
-- schema and the tracked migration history (see StaffRecord grade fields,
-- StaffOnboardingDocument FKs, etc. — confirmed intentional, not a bug) that
-- makes the shadow-database diff `migrate dev` needs unusable right now.
-- This file only creates new tables/indexes/constraints, so it is unaffected
-- by that drift and safe to apply standalone.

-- CreateTable
CREATE TABLE "cv_screening_profiles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "criteria" JSONB NOT NULL,
    "defaultAiService" TEXT,
    "defaultAiModel" TEXT,
    "defaultStrictness" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_screening_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_screening_runs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "totalCandidates" INTEGER NOT NULL,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "succeededCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "useAI" BOOLEAN NOT NULL DEFAULT true,
    "aiService" TEXT,
    "aiModel" TEXT,
    "strictness" TEXT,
    "triggeredBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_screening_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_screening_cv_results" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "candidateName" TEXT,
    "candidateEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "overallScore" DOUBLE PRECISION,
    "technicalScore" DOUBLE PRECISION,
    "experienceScore" DOUBLE PRECISION,
    "educationScore" DOUBLE PRECISION,
    "softSkillsScore" DOUBLE PRECISION,
    "culturalFit" DOUBLE PRECISION,
    "growthPotential" DOUBLE PRECISION,
    "aiSummary" TEXT,
    "aiDetails" JSONB,
    "scoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_screening_cv_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_screening_usage_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "runId" TEXT,
    "resultId" TEXT,
    "service" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "actualCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "endpoint" TEXT NOT NULL,
    "inputLength" INTEGER NOT NULL,
    "outputLength" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cv_screening_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cv_screening_profiles_companyId_status_idx" ON "cv_screening_profiles"("companyId", "status");

-- CreateIndex
CREATE INDEX "cv_screening_runs_companyId_status_idx" ON "cv_screening_runs"("companyId", "status");

-- CreateIndex
CREATE INDEX "cv_screening_runs_profileId_idx" ON "cv_screening_runs"("profileId");

-- CreateIndex
CREATE INDEX "cv_screening_cv_results_runId_idx" ON "cv_screening_cv_results"("runId");

-- CreateIndex
CREATE INDEX "cv_screening_cv_results_companyId_runId_idx" ON "cv_screening_cv_results"("companyId", "runId");

-- CreateIndex
CREATE INDEX "cv_screening_cv_results_runId_status_idx" ON "cv_screening_cv_results"("runId", "status");

-- CreateIndex
CREATE INDEX "cv_screening_cv_results_runId_overallScore_idx" ON "cv_screening_cv_results"("runId", "overallScore");

-- CreateIndex
CREATE INDEX "cv_screening_usage_logs_companyId_idx" ON "cv_screening_usage_logs"("companyId");

-- CreateIndex
CREATE INDEX "cv_screening_usage_logs_createdAt_idx" ON "cv_screening_usage_logs"("createdAt");

-- CreateIndex
CREATE INDEX "cv_screening_usage_logs_companyId_service_createdAt_idx" ON "cv_screening_usage_logs"("companyId", "service", "createdAt");

-- AddForeignKey
ALTER TABLE "cv_screening_profiles" ADD CONSTRAINT "cv_screening_profiles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_screening_runs" ADD CONSTRAINT "cv_screening_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_screening_runs" ADD CONSTRAINT "cv_screening_runs_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "cv_screening_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_screening_cv_results" ADD CONSTRAINT "cv_screening_cv_results_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_screening_cv_results" ADD CONSTRAINT "cv_screening_cv_results_runId_fkey" FOREIGN KEY ("runId") REFERENCES "cv_screening_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_screening_usage_logs" ADD CONSTRAINT "cv_screening_usage_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
