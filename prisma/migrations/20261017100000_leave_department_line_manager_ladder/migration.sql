-- Leave approvals: per-department line-manager ladder + per-request approval steps.
-- Additive only. Existing leave columns (managerApproverId, currentStep, status, hr*) are untouched.

-- 1) Ladder of line managers per department (level 1 = closest to staff)
CREATE TABLE "department_line_managers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "department_line_managers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "department_line_managers_departmentId_staffId_key" ON "department_line_managers"("departmentId", "staffId");
CREATE UNIQUE INDEX "department_line_managers_departmentId_level_key" ON "department_line_managers"("departmentId", "level");
CREATE INDEX "department_line_managers_companyId_idx" ON "department_line_managers"("companyId");
CREATE INDEX "department_line_managers_staffId_idx" ON "department_line_managers"("staffId");

ALTER TABLE "department_line_managers" ADD CONSTRAINT "department_line_managers_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "department_line_managers" ADD CONSTRAINT "department_line_managers_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Per-request approval chain snapshot
CREATE TABLE "leave_approval_steps" (
    "id" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "approverStaffId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "actedByStaffId" TEXT,
    "actedByUserId" TEXT,
    "actedAt" TIMESTAMP(3),
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_approval_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leave_approval_steps_leaveRequestId_level_key" ON "leave_approval_steps"("leaveRequestId", "level");
CREATE INDEX "leave_approval_steps_approverStaffId_status_idx" ON "leave_approval_steps"("approverStaffId", "status");

ALTER TABLE "leave_approval_steps" ADD CONSTRAINT "leave_approval_steps_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_approval_steps" ADD CONSTRAINT "leave_approval_steps_approverStaffId_fkey" FOREIGN KEY ("approverStaffId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3) Current ladder position on the request
ALTER TABLE "leave_requests" ADD COLUMN "currentLevel" INTEGER;

-- 4) Backfill: in-flight requests waiting on a manager keep working. They get one
--    LINE_MANAGER step (their snapshotted manager) and a trailing HR step.
INSERT INTO "leave_approval_steps" ("id", "leaveRequestId", "level", "kind", "approverStaffId", "status", "updatedAt")
SELECT 'bf_' || lr."id" || '_1', lr."id", 1, 'LINE_MANAGER', lr."managerApproverId", 'PENDING', CURRENT_TIMESTAMP
FROM "leave_requests" lr
WHERE lr."status" = 'PENDING' AND lr."currentStep" = 'MANAGER' AND lr."managerApproverId" IS NOT NULL;

INSERT INTO "leave_approval_steps" ("id", "leaveRequestId", "level", "kind", "status", "updatedAt")
SELECT 'bf_' || lr."id" || '_2', lr."id", 2, 'HR', 'PENDING', CURRENT_TIMESTAMP
FROM "leave_requests" lr
WHERE lr."status" = 'PENDING' AND lr."currentStep" = 'MANAGER' AND lr."managerApproverId" IS NOT NULL;

UPDATE "leave_requests"
SET "currentLevel" = 1
WHERE "status" = 'PENDING' AND "currentStep" = 'MANAGER' AND "managerApproverId" IS NOT NULL;

-- Requests already waiting on HR get just the HR step.
INSERT INTO "leave_approval_steps" ("id", "leaveRequestId", "level", "kind", "status", "updatedAt")
SELECT 'bf_' || lr."id" || '_hr', lr."id", 1, 'HR', 'PENDING', CURRENT_TIMESTAMP
FROM "leave_requests" lr
WHERE lr."currentStep" = 'HR' AND lr."status" IN ('PENDING', 'MANAGER_APPROVED');
