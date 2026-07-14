-- Migration: Add panel access token to candidate assessments
-- Allows interview panelists to access the interviewer dashboard via a
-- one-time secure link without being logged into the system.

ALTER TABLE "recruitment_candidate_assessments" ADD COLUMN IF NOT EXISTS "panelAccessToken" TEXT;

-- Unique constraint ensures tokens are globally unique
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'recruitment_candidate_assessments_panelAccessToken_key'
    ) THEN
        ALTER TABLE "recruitment_candidate_assessments" ADD CONSTRAINT "recruitment_candidate_assessments_panelAccessToken_key" UNIQUE ("panelAccessToken");
    END IF;
END $$;
