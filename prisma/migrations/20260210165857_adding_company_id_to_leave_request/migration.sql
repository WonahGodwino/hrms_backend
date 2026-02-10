/*
  Warnings:

  - You are about to drop the column `cancelComments` on the `LeaveRequest` table. All the data in the column will be lost.
  - You are about to drop the column `cancelledAt` on the `LeaveRequest` table. All the data in the column will be lost.
  - You are about to drop the column `referenceNumber` on the `LeaveRequest` table. All the data in the column will be lost.
  - You are about to drop the column `rejectComments` on the `LeaveRequest` table. All the data in the column will be lost.
  - You are about to drop the column `rejectedAt` on the `LeaveRequest` table. All the data in the column will be lost.
  - You are about to alter the column `totalDays` on the `LeaveRequest` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(5,1)`.
  - Made the column `companyId` on table `LeaveRequest` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "LeaveRequest" DROP CONSTRAINT "LeaveRequest_companyId_fkey";

-- DropIndex
DROP INDEX "LeaveRequest_referenceNumber_key";

-- DropIndex
DROP INDEX "LeaveRequest_staffRecordId_status_idx";

-- AlterTable
ALTER TABLE "LeaveRequest" DROP COLUMN "cancelComments",
DROP COLUMN "cancelledAt",
DROP COLUMN "referenceNumber",
DROP COLUMN "rejectComments",
DROP COLUMN "rejectedAt",
ADD COLUMN     "hrApprovedBy" TEXT,
ADD COLUMN     "hrApproverRole" TEXT,
ADD COLUMN     "hrApproverUserId" TEXT,
ADD COLUMN     "managerApprovedBy" TEXT,
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "rejectedByStep" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ALTER COLUMN "totalDays" SET DATA TYPE DECIMAL(5,1),
ALTER COLUMN "status" SET DEFAULT 'PENDING',
ALTER COLUMN "currentStep" SET DEFAULT 'MANAGER',
ALTER COLUMN "companyId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "LeaveRequest_staffRecordId_startDate_idx" ON "LeaveRequest"("staffRecordId", "startDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_startDate_idx" ON "LeaveRequest"("status", "startDate");

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
