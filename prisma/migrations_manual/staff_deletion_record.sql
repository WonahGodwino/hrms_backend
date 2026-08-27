CREATE TABLE IF NOT EXISTS "staff_deletion_records" (
    "id" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "deletedBy" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "preservedData" JSONB NOT NULL,

    CONSTRAINT "staff_deletion_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "staff_deletion_records_companyId_idx" ON "staff_deletion_records"("companyId");
CREATE INDEX IF NOT EXISTS "staff_deletion_records_staffId_idx" ON "staff_deletion_records"("staffId");
