-- Baseline for the Recruitment Assessment Plans / Rounds / Candidate
-- Assessments / Scorecards / Offer Approvals tables, plus new columns on
-- `offers`. Hand-authored (not via `prisma migrate dev`) for the same
-- shadow-database-drift reason documented in 20260629094522_baseline_offboardings_table
-- and 20260911120000_rebuild_loans_benefits.
--
-- This reconstructs `prisma/migrations/recruitment_assessment_offers_migration.sql`
-- (a loose, untracked file sitting directly in the migrations folder — Prisma
-- never executes files outside a timestamped migration directory, so none of
-- it was ever part of tracked history even though it WAS run directly against
-- the real database on 2026-06-29) as a proper tracked migration, so replaying
-- history from scratch (shadow DB, CI, a future prod restore) builds the same
-- tables instead of failing the moment a later migration ALTERs one of them.
--
-- Changes from the original loose file, both to make it safe to apply a
-- second time against the real database (where everything below already
-- exists) and to match the schema's state as of this point in history:
--   - FK constraints that were separate `ALTER TABLE ... ADD CONSTRAINT`
--     statements are now declared inline inside each `CREATE TABLE IF NOT
--     EXISTS`, so they are skipped together with the table when it already
--     exists (plain `ADD CONSTRAINT` has no `IF NOT EXISTS` guard in
--     PostgreSQL and would error "constraint already exists" on a database
--     that already has it).
--   - `recruitment_assessment_rounds` omits `evaluationPlan` /
--     `evaluationDeadlineHours` and `recruitment_candidate_assessments`
--     omits `panelAccessToken` / `meetingDetails` — those are added by the
--     later migrations that introduced them
--     (20260712050000_add_round_evaluation_plan, 20260713010000_add_evaluation_deadline,
--     20260714010000_add_panel_access_token, 20260715000000_add_assessment_meeting_details),
--     which already run cleanly once the base tables exist.

-- ─── Enum types (idempotent) ───
DO $$ BEGIN CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RoundStatus" AS ENUM ('AWAITING_SCHEDULING', 'SCHEDULED', 'PENDING_FEEDBACK', 'COMPLETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ScorecardRecommendation" AS ENUM ('HIRE', 'NO_HIRE', 'MAYBE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OfferApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'AWAITING_PREVIOUS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ApprovalRoutingMode" AS ENUM ('SEQUENTIAL', 'CONCURRENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── New values on OfferStatus (safe additive) ───
ALTER TYPE "OfferStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "OfferStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "OfferStatus" ADD VALUE IF NOT EXISTS 'AWAITING_SIGNATURE';
ALTER TYPE "OfferStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- ─── recruitment_assessment_plans ───
CREATE TABLE IF NOT EXISTS "recruitment_assessment_plans" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "totalDurationMins" INTEGER,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archived" INTEGER DEFAULT 0,
    CONSTRAINT "recruitment_assessment_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rec_plans_co_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "rec_plans_co_status" ON "recruitment_assessment_plans"("companyId", "status");
CREATE INDEX IF NOT EXISTS "rec_plans_co_arch" ON "recruitment_assessment_plans"("companyId", "archived");

-- ─── recruitment_assessment_rounds ───
CREATE TABLE IF NOT EXISTS "recruitment_assessment_rounds" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "interviewType" "InterviewType" NOT NULL DEFAULT 'VIDEO',
    "duration" INTEGER NOT NULL,
    "gradingMetric" TEXT,
    "questionBanks" JSONB,
    "requiredInterviewers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recruitment_assessment_rounds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rec_rounds_plan_fkey" FOREIGN KEY ("planId") REFERENCES "recruitment_assessment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "rec_rounds_plan_order" ON "recruitment_assessment_rounds"("planId", "order");
CREATE INDEX IF NOT EXISTS "rec_rounds_plan" ON "recruitment_assessment_rounds"("planId");

-- ─── recruitment_candidate_assessments ───
CREATE TABLE IF NOT EXISTS "recruitment_candidate_assessments" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "currentRoundOrder" INTEGER NOT NULL DEFAULT 1,
    "roundStatus" "RoundStatus" NOT NULL DEFAULT 'AWAITING_SCHEDULING',
    "scheduledAt" TIMESTAMP(3),
    "schedulingNotes" TEXT,
    "interviewerIds" JSONB,
    "averageScore" DOUBLE PRECISION,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recruitment_candidate_assessments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rec_cand_app_fkey" FOREIGN KEY ("applicationId") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rec_cand_plan_fkey" FOREIGN KEY ("planId") REFERENCES "recruitment_assessment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rec_cand_co_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "rec_cand_app" ON "recruitment_candidate_assessments"("applicationId");
CREATE INDEX IF NOT EXISTS "rec_cand_co_status" ON "recruitment_candidate_assessments"("companyId", "roundStatus");
CREATE INDEX IF NOT EXISTS "rec_cand_plan" ON "recruitment_candidate_assessments"("planId");

-- ─── recruitment_scorecards ───
CREATE TABLE IF NOT EXISTS "recruitment_scorecards" (
    "id" TEXT NOT NULL,
    "candidateAssessmentId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "interviewerName" TEXT,
    "interviewerRole" TEXT,
    "scores" JSONB NOT NULL,
    "notes" TEXT,
    "recommendation" "ScorecardRecommendation" NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recruitment_scorecards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rec_scorecards_ca_fkey" FOREIGN KEY ("candidateAssessmentId") REFERENCES "recruitment_candidate_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rec_scorecards_r_fkey" FOREIGN KEY ("roundId") REFERENCES "recruitment_assessment_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "rec_scorecards_uniq" ON "recruitment_scorecards"("candidateAssessmentId", "roundId", "interviewerId");
CREATE INDEX IF NOT EXISTS "rec_scorecards_ca" ON "recruitment_scorecards"("candidateAssessmentId");
CREATE INDEX IF NOT EXISTS "rec_scorecards_r" ON "recruitment_scorecards"("roundId");

-- ─── recruitment_offer_approvals ───
CREATE TABLE IF NOT EXISTS "recruitment_offer_approvals" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "approverName" TEXT,
    "approverRole" TEXT,
    "step" INTEGER NOT NULL,
    "status" "OfferApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "actedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recruitment_offer_approvals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rec_offer_appr_o_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "rec_offer_appr_u" ON "recruitment_offer_approvals"("offerId", "approverId");
CREATE INDEX IF NOT EXISTS "rec_offer_appr_s" ON "recruitment_offer_approvals"("offerId", "step");

-- ─── offers: new columns (safe additive) ───
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "jobId" TEXT;
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "gradeId" TEXT;
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "gradeName" TEXT;
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "step" INTEGER;
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "bonusPercentage" DOUBLE PRECISION;
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "hmoTier" TEXT;
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "stockOptions" INTEGER;
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "signOnBonus" DECIMAL(18, 2);
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "relocationAllowance" DECIMAL(18, 2);
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "additionalBenefits" JSONB;
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "routingMode" "ApprovalRoutingMode";
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "internalNotes" TEXT;
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "draftPdfPath" TEXT;
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "executedPdfPath" TEXT;
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "dispatchMethod" TEXT;
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "dispatchedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "offers_jobId_idx" ON "offers"("jobId");
