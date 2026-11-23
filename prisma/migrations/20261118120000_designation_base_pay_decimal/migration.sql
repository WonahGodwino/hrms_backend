-- DB-004 step 1 (owner-approved 2026-11-18): store the designation base pay as
-- an exact amount instead of a floating-point number. Existing values are
-- rounded to 2 decimal places. Generated with `prisma migrate diff` (offline).

-- AlterTable
ALTER TABLE "Designation" ALTER COLUMN "basePay" SET DATA TYPE DECIMAL(18,2);
