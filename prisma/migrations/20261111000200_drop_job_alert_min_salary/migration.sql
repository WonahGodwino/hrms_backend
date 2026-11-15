-- Migration: 20261111000200_drop_job_alert_min_salary
--
-- DESTRUCTIVE. Candidates' saved minimum-salary preference for job alerts is removed.
-- Idempotent (IF EXISTS).
ALTER TABLE "job_alert_preferences" DROP COLUMN IF EXISTS "minSalary";
