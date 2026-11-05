-- Device Management — additive only, nothing existing is altered.
-- Hand-authored (not via `prisma migrate dev`) for the same reason as
-- 20260902120000_add_payroll_generation_module: this repo's shadow-database
-- replay currently fails on an unrelated pre-existing migration, so `prisma
-- migrate dev` can't compute a diff. Follows the same idempotent
-- `IF NOT EXISTS` style already used elsewhere in this migrations folder,
-- safe to apply with `prisma migrate deploy`.

-- Blocking fields on staff_records. Every existing row defaults to
-- isBlocked = false, i.e. exactly today's behavior for every current user.
ALTER TABLE "staff_records" ADD COLUMN IF NOT EXISTS "isBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "staff_records" ADD COLUMN IF NOT EXISTS "blockedAt" TIMESTAMP(3);
ALTER TABLE "staff_records" ADD COLUMN IF NOT EXISTS "blockedById" TEXT;
ALTER TABLE "staff_records" ADD COLUMN IF NOT EXISTS "blockedByName" TEXT;
ALTER TABLE "staff_records" ADD COLUMN IF NOT EXISTS "blockedByRole" TEXT;
ALTER TABLE "staff_records" ADD COLUMN IF NOT EXISTS "blockReason" TEXT;

-- One row per registered device "slot" for a staff member (max 3, enforced
-- in application code). Doubles as the session record — the JWT carries
-- this row's id as `deviceId`, so there is no separate session table.
CREATE TABLE IF NOT EXISTS "devices" (
    "id" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "deviceKey" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokedByRole" TEXT,
    "revokedReason" TEXT,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "devices_staffRecordId_deviceKey_key" ON "devices"("staffRecordId", "deviceKey");
CREATE INDEX IF NOT EXISTS "devices_staffRecordId_isActive_idx" ON "devices"("staffRecordId", "isActive");

DO $$ BEGIN
  ALTER TABLE "devices" ADD CONSTRAINT "devices_staffRecordId_fkey"
    FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Generic staff-scoped activity/audit log, purpose-built for Device
-- Management (login, device, block/unblock events).
CREATE TABLE IF NOT EXISTS "staff_activity_logs" (
    "id" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedById" TEXT NOT NULL,
    "performedByName" TEXT NOT NULL,
    "performedByRole" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "staff_activity_logs_staffRecordId_createdAt_idx" ON "staff_activity_logs"("staffRecordId", "createdAt");
CREATE INDEX IF NOT EXISTS "staff_activity_logs_companyId_createdAt_idx" ON "staff_activity_logs"("companyId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "staff_activity_logs" ADD CONSTRAINT "staff_activity_logs_staffRecordId_fkey"
    FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "staff_activity_logs" ADD CONSTRAINT "staff_activity_logs_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
