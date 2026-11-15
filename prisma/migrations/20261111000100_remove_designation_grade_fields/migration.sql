-- Migration: 20261111000100_remove_designation_grade_fields
--
-- DESTRUCTIVE. Removes the designation-level grade fields (seniority band, rank, pay bands) and
-- everything that was scoped by them. Data in these columns/tables is lost. Review before applying.
-- Idempotent (IF EXISTS) so it is safe to re-run.

-- 1) Appraisal template assignments scoped by job level.
DROP TABLE IF EXISTS "TemplateAssignmentJobLevelScope";

-- 2) Seniority snapshot on appraisal participants.
ALTER TABLE "AppraisalCycleParticipant" DROP COLUMN IF EXISTS "seniorityBand";

-- 3) Designation seniority and pay-band columns and their indexes.
DROP INDEX IF EXISTS "Designation_companyId_rank_idx";
DROP INDEX IF EXISTS "Designation_companyId_seniorityBand_idx";
ALTER TABLE "Designation"
  DROP COLUMN IF EXISTS "rank",
  DROP COLUMN IF EXISTS "seniorityBand",
  DROP COLUMN IF EXISTS "minSalary",
  DROP COLUMN IF EXISTS "maxSalary";

-- 4) The enum is no longer referenced by any column.
DROP TYPE IF EXISTS "SeniorityBand";
