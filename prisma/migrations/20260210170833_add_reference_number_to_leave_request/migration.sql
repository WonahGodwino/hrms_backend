/*
  Warnings:

  - A unique constraint covering the columns `[referenceNumber]` on the table `LeaveRequest` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "referenceNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "LeaveRequest_referenceNumber_key" ON "LeaveRequest"("referenceNumber");
