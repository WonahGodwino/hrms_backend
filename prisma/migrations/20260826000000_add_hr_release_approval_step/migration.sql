-- Migration: route Tax Manager concurrence back to HR (Stage 1) for sign-off
-- before Internal Audit (Stage 3). Adds one PhedApprovalMemoStatus value
-- (PENDING_HR_APPROVAL) and one PhedApprovalStampAction value
-- (RELEASED_TO_AUDIT). Idempotent via duplicate_object guards.

DO $$ BEGIN
    ALTER TYPE "PhedApprovalMemoStatus" ADD VALUE 'PENDING_HR_APPROVAL';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE "PhedApprovalStampAction" ADD VALUE 'RELEASED_TO_AUDIT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
