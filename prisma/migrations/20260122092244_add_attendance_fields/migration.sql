/*
  Warnings:

  - You are about to drop the `Attendance` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_staffId_fkey";

-- DropTable
DROP TABLE "Attendance";

-- CreateTable
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "signInTime" TIMESTAMP(3),
    "signOutTime" TIMESTAMP(3),
    "recordedById" TEXT,
    "recordedByRole" TEXT,
    "method" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendances_companyId_date_idx" ON "attendances"("companyId", "date");

-- CreateIndex
CREATE INDEX "attendances_staffId_date_idx" ON "attendances"("staffId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_companyId_staffId_date_key" ON "attendances"("companyId", "staffId", "date");

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
