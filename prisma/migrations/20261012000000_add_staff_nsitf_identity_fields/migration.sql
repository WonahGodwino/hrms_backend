-- NSITF Employees' Schedule of Payments identity fields on StaffRecord.
-- All 12 columns are nullable — purely additive, no backfill, no existing
-- data touched. See backend/src/app/lib/staff/nsitf-identity-fields.ts.

ALTER TABLE "staff_records"
    ADD COLUMN IF NOT EXISTS "middleName" TEXT,
    ADD COLUMN IF NOT EXISTS "gender" TEXT,
    ADD COLUMN IF NOT EXISTS "dateOfBirth" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "maritalStatus" TEXT,
    ADD COLUMN IF NOT EXISTS "stateOfOrigin" TEXT,
    ADD COLUMN IF NOT EXISTS "lgaOfOrigin" TEXT,
    ADD COLUMN IF NOT EXISTS "townOfOrigin" TEXT,
    ADD COLUMN IF NOT EXISTS "alternatePhone" TEXT,
    ADD COLUMN IF NOT EXISTS "nin" TEXT,
    ADD COLUMN IF NOT EXISTS "stateOfIssuance" TEXT,
    ADD COLUMN IF NOT EXISTS "residentialAddress" TEXT,
    ADD COLUMN IF NOT EXISTS "numberOfPrimaryDependants" INTEGER;
