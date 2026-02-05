-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "workWeekPattern" VARCHAR(20);

-- AlterTable
ALTER TABLE "leave_policies" ADD COLUMN     "allowHalfDays" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxConsecutiveDays" INTEGER,
ADD COLUMN     "requireManagerComments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seasonalRestrictions" TEXT;

-- CreateTable
CREATE TABLE "leave_blackout_periods" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "policyId" TEXT,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "appliesToAllLeaveTypes" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_blackout_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_blackout_periods_companyId_startDate_endDate_idx" ON "leave_blackout_periods"("companyId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "leave_blackout_periods_policyId_idx" ON "leave_blackout_periods"("policyId");

-- AddForeignKey
ALTER TABLE "leave_blackout_periods" ADD CONSTRAINT "leave_blackout_periods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_blackout_periods" ADD CONSTRAINT "leave_blackout_periods_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "leave_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
