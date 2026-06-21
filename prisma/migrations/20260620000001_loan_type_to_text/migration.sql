-- Migration: 20260620000001_loan_type_to_text
--
-- Converts LoanRequest.loanType from the fixed LoanType enum to free-form TEXT.
-- This allows companies to store their own loan product names (e.g. "Car Loan",
-- "Staff Welfare Loan") rather than being restricted to the original four enum values.
--
-- Existing rows are preserved: PERSONAL_LOAN → 'PERSONAL_LOAN', etc.

-- Step 1: Remove the enum-typed default before changing the column type.
--         PostgreSQL cannot implicitly cast the old default expression to TEXT.
ALTER TABLE "loan_requests" ALTER COLUMN "loanType" DROP DEFAULT;

-- Step 2: Convert the column from LoanType enum → TEXT.
--         The USING clause converts each stored enum label to its text representation.
ALTER TABLE "loan_requests"
  ALTER COLUMN "loanType" TYPE TEXT USING "loanType"::TEXT;

-- Step 3: Restore a sensible plain-text default for rows inserted without an explicit value.
ALTER TABLE "loan_requests" ALTER COLUMN "loanType" SET DEFAULT 'OTHER';

-- Step 4: Drop the now-unused LoanType enum type.
DROP TYPE IF EXISTS "LoanType";
