-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "pensionEmployerCode" TEXT;

-- AlterTable
ALTER TABLE "staff_records" ADD COLUMN     "otherPensionContribution" DECIMAL(18,2),
ADD COLUMN     "pensionContributionType" TEXT,
ADD COLUMN     "pensionEmployerCode" TEXT,
ADD COLUMN     "pfaCode" TEXT,
ADD COLUMN     "rsaPin" TEXT,
ADD COLUMN     "voluntaryPensionEmployee" DECIMAL(18,2),
ADD COLUMN     "voluntaryPensionEmployer" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "pension_schedule_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "voluntaryEmployee" DECIMAL(18,2),
    "voluntaryEmployer" DECIMAL(18,2),
    "otherContribution" DECIMAL(18,2),
    "contributionType" TEXT,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pension_schedule_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pension_schedule_entries_companyId_sourceType_sourceId_idx" ON "pension_schedule_entries"("companyId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "pension_schedule_entries_staffRecordId_sourceType_sourceId_key" ON "pension_schedule_entries"("staffRecordId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "pension_schedule_entries" ADD CONSTRAINT "pension_schedule_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_schedule_entries" ADD CONSTRAINT "pension_schedule_entries_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
