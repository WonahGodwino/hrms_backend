/*
  Warnings:

  - You are about to drop the column `errors` on the `leave_uploads` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "leave_uploads" DROP COLUMN "errors",
ADD COLUMN     "blackoutPeriodsCreated" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "blackoutPeriodsFailed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "blackoutPeriodsUpdated" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failedRecords" JSONB,
ADD COLUMN     "holidaysUpdated" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "leaveTypesUpdated" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "policiesUpdated" INTEGER NOT NULL DEFAULT 0;
