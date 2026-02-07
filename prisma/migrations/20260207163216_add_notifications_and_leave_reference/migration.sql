/*
  Warnings:

  - You are about to drop the `leave_requests` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "leave_requests" DROP CONSTRAINT "leave_requests_leaveTypeId_fkey";

-- DropForeignKey
ALTER TABLE "leave_requests" DROP CONSTRAINT "leave_requests_managerApproverId_fkey";

-- DropForeignKey
ALTER TABLE "leave_requests" DROP CONSTRAINT "leave_requests_staffRecordId_fkey";

-- DropTable
DROP TABLE "leave_requests";

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "staffRecordId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalDays" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "emergencyContact" TEXT,
    "contactPhone" TEXT,
    "handoverTo" TEXT,
    "handoverNotes" TEXT,
    "attachmentUrl" TEXT,
    "fileName" TEXT,
    "status" TEXT NOT NULL,
    "currentStep" TEXT NOT NULL,
    "managerApproverId" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "managerApprovedAt" TIMESTAMP(3),
    "hrApprovedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "managerComments" TEXT,
    "hrComments" TEXT,
    "rejectComments" TEXT,
    "cancelComments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaveRequest_referenceNumber_key" ON "LeaveRequest"("referenceNumber");

-- CreateIndex
CREATE INDEX "LeaveRequest_staffRecordId_status_idx" ON "LeaveRequest"("staffRecordId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_managerApproverId_status_idx" ON "LeaveRequest"("managerApproverId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_companyId_createdAt_idx" ON "LeaveRequest"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_currentStep_idx" ON "LeaveRequest"("status", "currentStep");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_companyId_createdAt_idx" ON "Notification"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_type_companyId_idx" ON "Notification"("type", "companyId");

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_managerApproverId_fkey" FOREIGN KEY ("managerApproverId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_handoverTo_fkey" FOREIGN KEY ("handoverTo") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
