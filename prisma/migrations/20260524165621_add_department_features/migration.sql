/*
  Warnings:

  - You are about to drop the column `locationLga` on the `candidates` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `interviews` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `interviews` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "candidate_files" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "candidates" DROP COLUMN "locationLga";

-- AlterTable
ALTER TABLE "interviews" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "payroll_uploads" ALTER COLUMN "totalRecords" SET DEFAULT 0,
ALTER COLUMN "successful" SET DEFAULT 0,
ALTER COLUMN "failed" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "staff_records" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "location" TEXT,
ALTER COLUMN "department" DROP NOT NULL;

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "businessUnit" TEXT,
    "companyId" TEXT NOT NULL,
    "headId" TEXT,
    "assistantHeadId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "activeHeadcount" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "maxHeadcount" INTEGER,
    "costCenter" TEXT,
    "budgetCode" TEXT,
    "positionCapacity" JSONB,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_staff_history" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromDepartmentId" TEXT,
    "toDepartmentId" TEXT,
    "oldPosition" TEXT,
    "newPosition" TEXT,
    "reason" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_staff_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_audit_logs" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "type" TEXT,
    "details" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "departments_companyId_idx" ON "departments"("companyId");

-- CreateIndex
CREATE INDEX "departments_status_idx" ON "departments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "departments_companyId_code_key" ON "departments"("companyId", "code");

-- CreateIndex
CREATE INDEX "department_staff_history_staffId_effectiveDate_idx" ON "department_staff_history"("staffId", "effectiveDate");

-- CreateIndex
CREATE INDEX "department_staff_history_departmentId_effectiveDate_idx" ON "department_staff_history"("departmentId", "effectiveDate");

-- CreateIndex
CREATE INDEX "department_staff_history_companyId_idx" ON "department_staff_history"("companyId");

-- CreateIndex
CREATE INDEX "department_audit_logs_departmentId_timestamp_idx" ON "department_audit_logs"("departmentId", "timestamp");

-- CreateIndex
CREATE INDEX "department_audit_logs_companyId_timestamp_idx" ON "department_audit_logs"("companyId", "timestamp");

-- CreateIndex
CREATE INDEX "department_audit_logs_type_idx" ON "department_audit_logs"("type");

-- AddForeignKey
ALTER TABLE "staff_records" ADD CONSTRAINT "staff_records_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_headId_fkey" FOREIGN KEY ("headId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_assistantHeadId_fkey" FOREIGN KEY ("assistantHeadId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_staff_history" ADD CONSTRAINT "department_staff_history_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_staff_history" ADD CONSTRAINT "department_staff_history_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_staff_history" ADD CONSTRAINT "department_staff_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_staff_history" ADD CONSTRAINT "department_staff_history_fromDepartmentId_fkey" FOREIGN KEY ("fromDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_staff_history" ADD CONSTRAINT "department_staff_history_toDepartmentId_fkey" FOREIGN KEY ("toDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_audit_logs" ADD CONSTRAINT "department_audit_logs_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_audit_logs" ADD CONSTRAINT "department_audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
