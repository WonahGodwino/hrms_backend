-- New table: phed_deduction_liabilities
CREATE TABLE "phed_deduction_liabilities" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "phed_deduction_liabilities_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "phed_deduction_liabilities"
  ADD CONSTRAINT "phed_deduction_liabilities_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "phed_deduction_liabilities_companyId_name_key"
  ON "phed_deduction_liabilities"("companyId", "name");

-- New table: phed_staff_deduction_liabilities
CREATE TABLE "phed_staff_deduction_liabilities" (
  "id"                   TEXT NOT NULL,
  "staffId"              TEXT NOT NULL,
  "deductionLiabilityId" TEXT NOT NULL,
  "amount"               DECIMAL(18,2) NOT NULL DEFAULT 0,
  "assignedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "phed_staff_deduction_liabilities_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "phed_staff_deduction_liabilities"
  ADD CONSTRAINT "phed_staff_deduction_liabilities_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "phed_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "phed_staff_deduction_liabilities"
  ADD CONSTRAINT "phed_staff_deduction_liabilities_deductionLiabilityId_fkey"
    FOREIGN KEY ("deductionLiabilityId") REFERENCES "phed_deduction_liabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "phed_staff_deduction_liabilities_staffId_deductionLiabilityId_key"
  ON "phed_staff_deduction_liabilities"("staffId", "deductionLiabilityId");

-- Add deductionLiabilities column to phed_computed_payrolls
ALTER TABLE "phed_computed_payrolls"
  ADD COLUMN "deductionLiabilities" DECIMAL(18,2) NOT NULL DEFAULT 0;
