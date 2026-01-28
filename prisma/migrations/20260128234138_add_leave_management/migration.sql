-- AlterTable
ALTER TABLE "staff_records" ADD COLUMN     "managerId" TEXT;

-- CreateTable
CREATE TABLE "leave_policies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "maxDays" INTEGER NOT NULL,
    "carryOver" INTEGER NOT NULL DEFAULT 0,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "accrualRate" DOUBLE PRECISION,
    "minEmploymentMonths" INTEGER NOT NULL DEFAULT 0,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "approvalWorkflow" TEXT NOT NULL DEFAULT 'MANAGER_THEN_HR',
    "noticePeriod" INTEGER NOT NULL DEFAULT 7,
    "documentationRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_leave_balances" (
    "id" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "usedDays" INTEGER NOT NULL DEFAULT 0,
    "pendingDays" INTEGER NOT NULL DEFAULT 0,
    "carriedOver" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalDays" DECIMAL(5,1) NOT NULL,
    "reason" TEXT NOT NULL,
    "emergencyContact" TEXT,
    "contactPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "currentStep" TEXT NOT NULL DEFAULT 'MANAGER',
    "managerApproverId" TEXT,
    "managerApprovedAt" TIMESTAMP(3),
    "managerApprovedBy" TEXT,
    "managerComments" TEXT,
    "hrApproverUserId" TEXT,
    "hrApproverRole" TEXT,
    "hrApprovedAt" TIMESTAMP(3),
    "hrApprovedBy" TEXT,
    "hrComments" TEXT,
    "rejectionReason" TEXT,
    "rejectedByStep" TEXT,
    "rejectedById" TEXT,
    "handoverTo" TEXT,
    "handoverNotes" TEXT,
    "attachmentUrl" TEXT,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_holidays" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT,
    "state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_policies_companyId_idx" ON "leave_policies"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_policies_companyId_name_key" ON "leave_policies"("companyId", "name");

-- CreateIndex
CREATE INDEX "leave_types_policyId_idx" ON "leave_types"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_policyId_name_key" ON "leave_types"("policyId", "name");

-- CreateIndex
CREATE INDEX "staff_leave_balances_staffRecordId_year_idx" ON "staff_leave_balances"("staffRecordId", "year");

-- CreateIndex
CREATE INDEX "staff_leave_balances_leaveTypeId_idx" ON "staff_leave_balances"("leaveTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_leave_balances_staffRecordId_leaveTypeId_year_key" ON "staff_leave_balances"("staffRecordId", "leaveTypeId", "year");

-- CreateIndex
CREATE INDEX "leave_requests_staffRecordId_startDate_idx" ON "leave_requests"("staffRecordId", "startDate");

-- CreateIndex
CREATE INDEX "leave_requests_status_startDate_idx" ON "leave_requests"("status", "startDate");

-- CreateIndex
CREATE INDEX "leave_requests_managerApproverId_status_idx" ON "leave_requests"("managerApproverId", "status");

-- CreateIndex
CREATE INDEX "leave_requests_hrApproverUserId_status_idx" ON "leave_requests"("hrApproverUserId", "status");

-- CreateIndex
CREATE INDEX "public_holidays_companyId_date_idx" ON "public_holidays"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "public_holidays_companyId_date_name_key" ON "public_holidays"("companyId", "date", "name");

-- AddForeignKey
ALTER TABLE "staff_records" ADD CONSTRAINT "staff_records_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "leave_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_leave_balances" ADD CONSTRAINT "staff_leave_balances_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_leave_balances" ADD CONSTRAINT "staff_leave_balances_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_managerApproverId_fkey" FOREIGN KEY ("managerApproverId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_holidays" ADD CONSTRAINT "public_holidays_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
