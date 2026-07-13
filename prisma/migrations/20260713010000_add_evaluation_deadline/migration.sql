-- Migration: Add evaluationDeadlineHours to recruitment_assessment_rounds
-- Date: 2026-07-13

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'recruitment_assessment_rounds' AND column_name = 'evaluationDeadlineHours'
    ) THEN
        ALTER TABLE "recruitment_assessment_rounds" ADD COLUMN "evaluationDeadlineHours" INTEGER;
    END IF;
END $$;
