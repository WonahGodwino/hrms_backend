-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "leaveRequestId" TEXT;

-- CreateIndex
CREATE INDEX "Notification_leaveRequestId_idx" ON "Notification"("leaveRequestId");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
