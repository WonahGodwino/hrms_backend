-- Add TIN and Pension Number to PhedStaff
ALTER TABLE "phed_staff"
  ADD COLUMN "tin"           TEXT,
  ADD COLUMN "pensionNumber" TEXT;

-- Add TIN and Pension Number snapshot to PhedComputedPayroll
ALTER TABLE "phed_computed_payrolls"
  ADD COLUMN "tin"           TEXT,
  ADD COLUMN "pensionNumber" TEXT;
