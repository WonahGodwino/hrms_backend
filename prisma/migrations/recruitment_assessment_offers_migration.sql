-- ============================================================================
-- SAFE ADDITIVE MIGRATION: Recruitment Module — Assessment Plans, Queue & Offers
-- Created: 2026-06-29 | Updated: 2026-06-29
-- ALL tables use "recruitment_" prefix to avoid conflicts with existing
-- Training module's "assessments" table.
-- 100% additive — no DROP, no DELETE, no destructive commands.
-- ============================================================================

-- 1. Create enum types (idempotent)
DO $$ BEGIN CREATE TYPE "public"."PlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."RoundStatus" AS ENUM ('AWAITING_SCHEDULING', 'SCHEDULED', 'PENDING_FEEDBACK', 'COMPLETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."ScorecardRecommendation" AS ENUM ('HIRE', 'NO_HIRE', 'MAYBE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."OfferApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'AWAITING_PREVIOUS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."ApprovalRoutingMode" AS ENUM ('SEQUENTIAL', 'CONCURRENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add new values to OfferStatus enum (safe additive)
DO $$ BEGIN ALTER TYPE "public"."OfferStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."OfferStatus" ADD VALUE IF NOT EXISTS 'APPROVED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."OfferStatus" ADD VALUE IF NOT EXISTS 'AWAITING_SIGNATURE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."OfferStatus" ADD VALUE IF NOT EXISTS 'REJECTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. recruitment_assessment_plans
CREATE TABLE IF NOT EXISTS "public"."recruitment_assessment_plans" (
    "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "name" TEXT NOT NULL,
    "description" TEXT, "status" "public"."PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "totalDurationMins" INTEGER, "createdBy" TEXT, "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, "archived" INTEGER DEFAULT 0,
    CONSTRAINT "recruitment_assessment_plans_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "rec_plans_co_status" ON "public"."recruitment_assessment_plans"("companyId", "status");
CREATE INDEX IF NOT EXISTS "rec_plans_co_arch" ON "public"."recruitment_assessment_plans"("companyId", "archived");
ALTER TABLE "public"."recruitment_assessment_plans" ADD CONSTRAINT "rec_plans_co_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. recruitment_assessment_rounds
CREATE TABLE IF NOT EXISTS "public"."recruitment_assessment_rounds" (
    "id" TEXT NOT NULL, "planId" TEXT NOT NULL, "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL, "interviewType" "public"."InterviewType" NOT NULL DEFAULT 'VIDEO',
    "duration" INTEGER NOT NULL, "gradingMetric" TEXT,
    "questionBanks" JSONB, "requiredInterviewers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recruitment_assessment_rounds_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "rec_rounds_plan_order" ON "public"."recruitment_assessment_rounds"("planId", "order");
CREATE INDEX IF NOT EXISTS "rec_rounds_plan" ON "public"."recruitment_assessment_rounds"("planId");
ALTER TABLE "public"."recruitment_assessment_rounds" ADD CONSTRAINT "rec_rounds_plan_fkey" FOREIGN KEY ("planId") REFERENCES "public"."recruitment_assessment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. recruitment_candidate_assessments
CREATE TABLE IF NOT EXISTS "public"."recruitment_candidate_assessments" (
    "id" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "planId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL, "currentRoundOrder" INTEGER NOT NULL DEFAULT 1,
    "roundStatus" "public"."RoundStatus" NOT NULL DEFAULT 'AWAITING_SCHEDULING',
    "scheduledAt" TIMESTAMP(3), "schedulingNotes" TEXT,
    "interviewerIds" JSONB, "averageScore" DOUBLE PRECISION,
    "createdBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recruitment_candidate_assessments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "rec_cand_app" ON "public"."recruitment_candidate_assessments"("applicationId");
CREATE INDEX IF NOT EXISTS "rec_cand_co_status" ON "public"."recruitment_candidate_assessments"("companyId", "roundStatus");
CREATE INDEX IF NOT EXISTS "rec_cand_plan" ON "public"."recruitment_candidate_assessments"("planId");
ALTER TABLE "public"."recruitment_candidate_assessments" ADD CONSTRAINT "rec_cand_app_fkey" FOREIGN KEY ("applicationId") REFERENCES "public"."job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."recruitment_candidate_assessments" ADD CONSTRAINT "rec_cand_plan_fkey" FOREIGN KEY ("planId") REFERENCES "public"."recruitment_assessment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."recruitment_candidate_assessments" ADD CONSTRAINT "rec_cand_co_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. recruitment_scorecards
CREATE TABLE IF NOT EXISTS "public"."recruitment_scorecards" (
    "id" TEXT NOT NULL, "candidateAssessmentId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL, "interviewerId" TEXT NOT NULL,
    "interviewerName" TEXT, "interviewerRole" TEXT,
    "scores" JSONB NOT NULL, "notes" TEXT,
    "recommendation" "public"."ScorecardRecommendation" NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recruitment_scorecards_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "rec_scorecards_uniq" ON "public"."recruitment_scorecards"("candidateAssessmentId", "roundId", "interviewerId");
CREATE INDEX IF NOT EXISTS "rec_scorecards_ca" ON "public"."recruitment_scorecards"("candidateAssessmentId");
CREATE INDEX IF NOT EXISTS "rec_scorecards_r" ON "public"."recruitment_scorecards"("roundId");
ALTER TABLE "public"."recruitment_scorecards" ADD CONSTRAINT "rec_scorecards_ca_fkey" FOREIGN KEY ("candidateAssessmentId") REFERENCES "public"."recruitment_candidate_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."recruitment_scorecards" ADD CONSTRAINT "rec_scorecards_r_fkey" FOREIGN KEY ("roundId") REFERENCES "public"."recruitment_assessment_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. recruitment_offer_approvals
CREATE TABLE IF NOT EXISTS "public"."recruitment_offer_approvals" (
    "id" TEXT NOT NULL, "offerId" TEXT NOT NULL, "approverId" TEXT NOT NULL,
    "approverName" TEXT, "approverRole" TEXT, "step" INTEGER NOT NULL,
    "status" "public"."OfferApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT, "actedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recruitment_offer_approvals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "rec_offer_appr_u" ON "public"."recruitment_offer_approvals"("offerId", "approverId");
CREATE INDEX IF NOT EXISTS "rec_offer_appr_s" ON "public"."recruitment_offer_approvals"("offerId", "step");
ALTER TABLE "public"."recruitment_offer_approvals" ADD CONSTRAINT "rec_offer_appr_o_fkey" FOREIGN KEY ("offerId") REFERENCES "public"."offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. ALTER offers — add new columns (safe additive)
ALTER TABLE "public"."offers" ADD COLUMN IF NOT EXISTS "jobId" TEXT;
ALTER TABLE "public"."offers" ADD COLUMN IF NOT EXISTS "gradeId" TEXT;
ALTER TABLE "public"."offers" ADD COLUMN IF NOT EXISTS "gradeName" TEXT;
ALTER TABLE "public"."offers" ADD COLUMN IF NOT EXISTS "step" INTEGER;
ALTER TABLE "public"."offers" ADD COLUMN IF NOT EXISTS "bonusPercentage" DOUBLE PRECISION;
ALTER TABLE "public"."offers" ADD COLUMN IF NOT EXISTS "hmoTier" TEXT;
ALTER TABLE "public"."offers" ADD COLUMN IF NOT EXISTS "stockOptions" INTEGER;
ALTER TABLE "public"."offers" ADD COLUMN IF NOT EXISTS "signOnBonus" DECIMAL(18, 2);
ALTER TABLE "public"."offers" ADD COLUMN IF NOT EXISTS "relocationAllowance" DECIMAL(18, 2);
ALTER TABLE "public"."offers" ADD COLUMN IF NOT EXISTS "additionalBenefits" JSONB;
ALTER TABLE "public"."offers" ADD COLUMN IF NOT EXISTS "routingMode" "public"."ApprovalRoutingMode";
ALTER TABLE "public"."offers" ADD COLUMN IF NOT EXISTS "internalNotes" TEXT;
ALTER TABLE "public"."offers" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "public"."offers" ADD COLUMN IF NOT EXISTS "draftPdfPath" TEXT;
ALTER TABLE "public"."offers" ADD COLUMN IF NOT EXISTS "executedPdfPath" TEXT;
ALTER TABLE "public"."offers" ADD COLUMN IF NOT EXISTS "dispatchMethod" TEXT;
ALTER TABLE "public"."offers" ADD COLUMN IF NOT EXISTS "dispatchedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "offers_jobId_idx" ON "public"."offers"("jobId");

-- ============================================================================
-- DONE. 100% additive. Safe for production deployment.
-- ============================================================================
