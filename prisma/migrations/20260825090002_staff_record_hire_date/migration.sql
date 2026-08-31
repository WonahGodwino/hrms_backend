-- Adds a nullable hireDate to StaffRecord for tenure/attrition reporting.
-- Additive only — existing rows get NULL until backfilled (e.g. via the
-- staff bulk-edit upload flow). New staff created via bulk upload or
-- onboarding-completion default hireDate to the creation timestamp going
-- forward, so only pre-existing staff ever need backfilling.
ALTER TABLE "staff_records" ADD COLUMN IF NOT EXISTS "hireDate" TIMESTAMP(3);
