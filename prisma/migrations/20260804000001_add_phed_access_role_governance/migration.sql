-- PHED access-role governance: immutable assignment/change audit trail.
-- Safe for production: creates only the new enum, table, indexes, and keys.

DO $$ BEGIN
    CREATE TYPE "PhedAccessRoleChangeAction" AS ENUM ('ASSIGNED', 'CHANGED', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "phed_access_role_changes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "action" "PhedAccessRoleChangeAction" NOT NULL,
    "previousRole" "PhedAccessRole",
    "newRole" "PhedAccessRole",
    "reason" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedByName" TEXT NOT NULL,
    "changedByRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "phed_access_role_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "phed_access_role_changes_companyId_createdAt_idx"
  ON "phed_access_role_changes"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "phed_access_role_changes_staffRecordId_createdAt_idx"
  ON "phed_access_role_changes"("staffRecordId", "createdAt");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'phed_access_role_changes_companyId_fkey') THEN
        ALTER TABLE "phed_access_role_changes"
          ADD CONSTRAINT "phed_access_role_changes_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'phed_access_role_changes_staffRecordId_fkey') THEN
        ALTER TABLE "phed_access_role_changes"
          ADD CONSTRAINT "phed_access_role_changes_staffRecordId_fkey"
          FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT;
    END IF;
END $$;
