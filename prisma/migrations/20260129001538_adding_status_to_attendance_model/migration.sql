-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "status" TEXT DEFAULT 'PRESENT';

-- CreateIndex
CREATE INDEX "attendances_status_date_idx" ON "attendances"("status", "date");
