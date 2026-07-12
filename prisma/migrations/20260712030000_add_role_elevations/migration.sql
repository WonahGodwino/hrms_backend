-- Temporary role elevations. An ADMIN/HR can grant a staff member a higher
-- access role (ADMIN/HR) for an urgent task (e.g. joining an interview panel).
-- It is an overlay: the staff's base role is never changed; while ACTIVE (and
-- not past expiresAt) the auth layer resolves the elevated role, otherwise it
-- falls back to the base role. Additive; existing rows/behaviour unaffected.
CREATE TABLE "role_elevations" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "staffId"       TEXT NOT NULL,
  "fromRole"      TEXT NOT NULL,
  "toRole"        TEXT NOT NULL,
  "reason"        TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'ACTIVE',
  "grantedBy"     TEXT NOT NULL,
  "grantedByName" TEXT,
  "grantedByRole" TEXT,
  "revokedBy"     TEXT,
  "revokedByName" TEXT,
  "revokedAt"     TIMESTAMP(3),
  "expiresAt"     TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "role_elevations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "role_elevations_companyId_status_idx" ON "role_elevations"("companyId", "status");
CREATE INDEX "role_elevations_staffId_status_idx" ON "role_elevations"("staffId", "status");

ALTER TABLE "role_elevations"
  ADD CONSTRAINT "role_elevations_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_elevations"
  ADD CONSTRAINT "role_elevations_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
