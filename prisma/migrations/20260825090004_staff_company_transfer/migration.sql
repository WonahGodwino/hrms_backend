CREATE TABLE IF NOT EXISTS "staff_company_transfers" (
    "id" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "fromCompanyId" TEXT NOT NULL,
    "toCompanyId" TEXT NOT NULL,
    "transferredBy" TEXT NOT NULL,
    "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "previousDepartmentId" TEXT,
    "previousGradeId" TEXT,
    "previousDesignationId" TEXT,
    "previousLocationId" TEXT,
    "previousManagerId" TEXT,
    "newDepartmentId" TEXT,
    "newGradeId" TEXT,
    "newDesignationId" TEXT,
    "newLocationId" TEXT,
    "recordCounts" JSONB NOT NULL,

    CONSTRAINT "staff_company_transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "staff_company_transfers_staffRecordId_idx" ON "staff_company_transfers"("staffRecordId");
CREATE INDEX IF NOT EXISTS "staff_company_transfers_fromCompanyId_idx" ON "staff_company_transfers"("fromCompanyId");
CREATE INDEX IF NOT EXISTS "staff_company_transfers_toCompanyId_idx" ON "staff_company_transfers"("toCompanyId");
