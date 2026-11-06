-- Add life assurance fields to phed_staff
-- hasLifeAssurance: flag that controls whether the annual premium is deducted before PAYE
-- lifeAssuranceAmount: the annual premium amount (nullable — NULL means not set)
ALTER TABLE "phed_staff"
  ADD COLUMN IF NOT EXISTS "hasLifeAssurance"    BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lifeAssuranceAmount" DECIMAL(18,2);

-- Add life assurance snapshot column to phed_computed_payrolls
-- Stored as 0 by default so existing computed rows are unaffected
ALTER TABLE "phed_computed_payrolls"
  ADD COLUMN IF NOT EXISTS "lifeAssuranceAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;
