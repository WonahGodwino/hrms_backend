-- Migration: 20260709100000_benefit_policy_job_scope
-- Adds an optional job scope to benefit policies so a benefit can be tied to a
-- specific job role, or left null to apply to all roles (the default).
-- Additive and idempotent — safe to run against production.

ALTER TABLE "BenefitPolicy"
  ADD COLUMN IF NOT EXISTS "jobId" TEXT;

CREATE INDEX IF NOT EXISTS "BenefitPolicy_companyId_jobId_idx"
  ON "BenefitPolicy"("companyId", "jobId");
