-- Migration: Add EVALUATION_GUIDE to CandidateFileType enum
-- Date: 2026-07-13

-- Safe: adds a new value to the enum (non-destructive)
DO $$
BEGIN
    ALTER TYPE "CandidateFileType" ADD VALUE IF NOT EXISTS 'EVALUATION_GUIDE';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
