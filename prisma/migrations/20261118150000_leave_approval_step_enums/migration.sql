-- DB-004 step 4, first conversion (owner-approved 2026-11-18): the leave
-- approval step kind and status become enums. Values in production on
-- 2026-11-18 (read-only check): kind HR, status APPROVED; the code writes only
-- LINE_MANAGER|HR and PENDING|APPROVED|REJECTED|SKIPPED.
--
-- Hand-written: `prisma migrate diff` would DROP and re-ADD both columns,
-- losing every value. ALTER ... TYPE ... USING converts in place; the existing
-- (approverStaffId, status) index is rebuilt by PostgreSQL automatically.

-- CreateEnum
CREATE TYPE "LeaveApprovalStepKind" AS ENUM ('LINE_MANAGER', 'HR');

-- CreateEnum
CREATE TYPE "LeaveApprovalStepStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');

-- AlterTable
ALTER TABLE "leave_approval_steps"
  ALTER COLUMN "kind" TYPE "LeaveApprovalStepKind" USING ("kind"::"LeaveApprovalStepKind");

ALTER TABLE "leave_approval_steps" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "leave_approval_steps"
  ALTER COLUMN "status" TYPE "LeaveApprovalStepStatus" USING ("status"::"LeaveApprovalStepStatus");
ALTER TABLE "leave_approval_steps" ALTER COLUMN "status" SET DEFAULT 'PENDING';
