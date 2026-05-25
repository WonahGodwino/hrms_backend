-- Add new allowance columns to phed_staff (nullable overrides)
ALTER TABLE "phed_staff"
  ADD COLUMN "domesticAllowance"      DECIMAL(18,2),
  ADD COLUMN "hazardAllowance"        DECIMAL(18,2),
  ADD COLUMN "electricityAllowance"   DECIMAL(18,2),
  ADD COLUMN "discoveryAllowance"     DECIMAL(18,2),
  ADD COLUMN "carSubsidy"             DECIMAL(18,2),
  ADD COLUMN "entertainmentAllowance" DECIMAL(18,2),
  ADD COLUMN "dataAllowance"          DECIMAL(18,2),
  ADD COLUMN "nightAllowance"         DECIMAL(18,2),
  ADD COLUMN "arrears"                DECIMAL(18,2);

-- Add new allowance columns to phed_computed_payrolls (snapshot, default 0)
ALTER TABLE "phed_computed_payrolls"
  ADD COLUMN "domesticAllowance"      DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "hazardAllowance"        DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "electricityAllowance"   DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discoveryAllowance"     DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "carSubsidy"             DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "entertainmentAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "dataAllowance"          DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "nightAllowance"         DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "arrears"                DECIMAL(18,2) NOT NULL DEFAULT 0;
