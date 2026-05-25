-- Switch union deduction from fixed naira (monthlyAmount) to percentage of gross salary.
ALTER TABLE "phed_unions"
  ADD COLUMN "percentage" DECIMAL(5,4) NOT NULL DEFAULT 0;

ALTER TABLE "phed_unions"
  DROP COLUMN "monthlyAmount";
