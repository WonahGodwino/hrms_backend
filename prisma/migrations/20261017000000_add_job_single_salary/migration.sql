-- Single numeric salary for jobs (company base currency). Additive only: the
-- legacy free-text "salaryRange" column is kept untouched as a read-only fallback.
ALTER TABLE "jobs" ADD COLUMN "salary" DECIMAL(18,2);

-- Backfill from legacy values that are a single plain number (e.g. "500,000").
-- Ranges / free text are skipped and keep showing through "salaryRange".
UPDATE "jobs"
SET "salary" = REPLACE(REPLACE("salaryRange", ',', ''), ' ', '')::DECIMAL(18,2)
WHERE "salaryRange" IS NOT NULL
  AND REPLACE(REPLACE("salaryRange", ',', ''), ' ', '') ~ '^[0-9]{1,14}(\.[0-9]{1,2})?$';
