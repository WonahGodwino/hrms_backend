-- Switch cooperative deductions from percentage-of-gross to per-member fixed amounts.
-- Adds contributionAmount, loanAmount, totalAmount to phed_staff_cooperatives.
-- Gives phed_cooperatives.percentage a default of 0 so it is no longer required on insert.

ALTER TABLE "phed_staff_cooperatives"
  ADD COLUMN "contributionAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "loanAmount"         DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "totalAmount"        DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "phed_cooperatives"
  ALTER COLUMN "percentage" SET DEFAULT 0;
