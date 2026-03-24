-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "handoverStaffId" TEXT;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_handoverStaffId_fkey" FOREIGN KEY ("handoverStaffId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
