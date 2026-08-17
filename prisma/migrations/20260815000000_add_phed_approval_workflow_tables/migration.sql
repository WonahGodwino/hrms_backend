-- PHED Modules 12 & 13 — approval workflow, change log, and staff exits.
-- Additive and idempotent: IF NOT EXISTS / duplicate_object guards only.
-- Creates the tables the schema models require but that no prior migration
-- provisioned (PhedApprovalMemo, PhedApprovalStamp, PhedChangeLog, PhedStaffExit).

DO $$ BEGIN
    CREATE TYPE "PhedApprovalMemoStatus" AS ENUM (
        'PENDING_REVIEW',
        'PENDING_FIRST_LEVEL_APPROVAL',
        'PENDING_SECOND_LEVEL_APPROVAL',
        'PENDING_FINAL_APPROVAL',
        'APPROVED',
        'RETURNED_FOR_CORRECTION'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "PhedApprovalStampAction" AS ENUM (
        'SUBMITTED',
        'RECOMMENDED',
        'APPROVED',
        'FINAL_APPROVED',
        'FLAGGED'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "PhedExitReason" AS ENUM (
        'RESIGNATION',
        'TERMINATION',
        'RETIREMENT',
        'END_OF_CONTRACT',
        'OTHER'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "phed_approval_memos" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "currentStage" INTEGER NOT NULL,
    "status" "PhedApprovalMemoStatus" NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "phed_approval_memos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "phed_approval_memos_payPeriodId_key"
  ON "phed_approval_memos"("payPeriodId");
CREATE INDEX IF NOT EXISTS "phed_approval_memos_companyId_status_idx"
  ON "phed_approval_memos"("companyId", "status");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'phed_approval_memos_companyId_fkey') THEN
        ALTER TABLE "phed_approval_memos"
          ADD CONSTRAINT "phed_approval_memos_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'phed_approval_memos_payPeriodId_fkey') THEN
        ALTER TABLE "phed_approval_memos"
          ADD CONSTRAINT "phed_approval_memos_payPeriodId_fkey"
          FOREIGN KEY ("payPeriodId") REFERENCES "phed_pay_periods"("id") ON DELETE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "phed_approval_stamps" (
    "id" TEXT NOT NULL,
    "memoId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "stage" INTEGER NOT NULL,
    "action" "PhedApprovalStampAction" NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" "PhedAccessRole" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "phed_approval_stamps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "phed_approval_stamps_memoId_attemptNumber_idx"
  ON "phed_approval_stamps"("memoId", "attemptNumber");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'phed_approval_stamps_memoId_fkey') THEN
        ALTER TABLE "phed_approval_stamps"
          ADD CONSTRAINT "phed_approval_stamps_memoId_fkey"
          FOREIGN KEY ("memoId") REFERENCES "phed_approval_memos"("id") ON DELETE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "phed_change_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL,
    "changedByName" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "phed_change_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "phed_change_logs_companyId_changedAt_idx"
  ON "phed_change_logs"("companyId", "changedAt");
CREATE INDEX IF NOT EXISTS "phed_change_logs_staffId_changedAt_idx"
  ON "phed_change_logs"("staffId", "changedAt");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'phed_change_logs_companyId_fkey') THEN
        ALTER TABLE "phed_change_logs"
          ADD CONSTRAINT "phed_change_logs_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'phed_change_logs_staffId_fkey') THEN
        ALTER TABLE "phed_change_logs"
          ADD CONSTRAINT "phed_change_logs_staffId_fkey"
          FOREIGN KEY ("staffId") REFERENCES "phed_staff"("id") ON DELETE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "phed_staff_exits" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "exitDate" TIMESTAMP(3) NOT NULL,
    "reason" "PhedExitReason" NOT NULL,
    "finalGrossPay" DECIMAL(18,2),
    "finalDeductions" DECIMAL(18,2),
    "finalNetPay" DECIMAL(18,2),
    "notes" TEXT,
    "recordedBy" TEXT NOT NULL,
    "recordedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "phed_staff_exits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "phed_staff_exits_companyId_exitDate_idx"
  ON "phed_staff_exits"("companyId", "exitDate");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'phed_staff_exits_companyId_fkey') THEN
        ALTER TABLE "phed_staff_exits"
          ADD CONSTRAINT "phed_staff_exits_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'phed_staff_exits_staffId_fkey') THEN
        ALTER TABLE "phed_staff_exits"
          ADD CONSTRAINT "phed_staff_exits_staffId_fkey"
          FOREIGN KEY ("staffId") REFERENCES "phed_staff"("id") ON DELETE CASCADE;
    END IF;
END $$;
