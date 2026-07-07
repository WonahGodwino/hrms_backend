-- Migration: 20260707000000_designation_pay_fields
-- Adds direct base-pay fields to Designation so that designations which are NOT
-- tied to a grade level can carry their own compensation, plus a benefits blob.
-- Additive and nullable/defaulted — existing rows are untouched and this is safe
-- to run against production. Idempotent via IF NOT EXISTS.

ALTER TABLE "Designation"
  ADD COLUMN IF NOT EXISTS "hasGradeLevel" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "basePay" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "basePayFrequency" "BasePayFrequency",
  ADD COLUMN IF NOT EXISTS "benefits" JSONB;

-- Backfill: existing designations that already reference a grade level should be
-- flagged as grade-based so the API reports them correctly.
UPDATE "Designation" SET "hasGradeLevel" = true WHERE "gradeLevelId" IS NOT NULL;
