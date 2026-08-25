-- Migration: add Tax Audit approval role (Stage 2) to the PHED approval chain.
-- Adds one PhedAccessRole value, one PhedApprovalMemoStatus value, and one
-- PhedApprovalStampAction value. Idempotent via duplicate_object guards.

DO $$ BEGIN
    ALTER TYPE "PhedAccessRole" ADD VALUE 'TAX_AUDIT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE "PhedApprovalMemoStatus" ADD VALUE 'PENDING_TAX_AUDIT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE "PhedApprovalStampAction" ADD VALUE 'TAX_AUDITED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
