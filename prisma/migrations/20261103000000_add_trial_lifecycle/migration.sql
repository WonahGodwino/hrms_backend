-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "readOnlyEndsAt" TIMESTAMP(3),
ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ADD COLUMN     "trialExtraDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trialLimitsProfile" VARCHAR(20),
ADD COLUMN     "trialStartsAt" TIMESTAMP(3),
ADD COLUMN     "trialStatus" VARCHAR(20) NOT NULL DEFAULT 'UNRESTRICTED';

-- CreateTable
CREATE TABLE "TrialUsageCounter" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "metric" VARCHAR(40) NOT NULL,
    "subjectKey" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialUsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrialSignal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "valueHash" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrialReview" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "reasons" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "decision" VARCHAR(30),
    "note" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrialUsageCounter_companyId_metric_idx" ON "TrialUsageCounter"("companyId", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "TrialUsageCounter_companyId_metric_subjectKey_key" ON "TrialUsageCounter"("companyId", "metric", "subjectKey");

-- CreateIndex
CREATE INDEX "TrialSignal_kind_valueHash_idx" ON "TrialSignal"("kind", "valueHash");

-- CreateIndex
CREATE INDEX "TrialSignal_companyId_idx" ON "TrialSignal"("companyId");

-- CreateIndex
CREATE INDEX "TrialReview_status_createdAt_idx" ON "TrialReview"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TrialReview_companyId_idx" ON "TrialReview"("companyId");

-- AddForeignKey
ALTER TABLE "TrialUsageCounter" ADD CONSTRAINT "TrialUsageCounter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialSignal" ADD CONSTRAINT "TrialSignal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialReview" ADD CONSTRAINT "TrialReview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

