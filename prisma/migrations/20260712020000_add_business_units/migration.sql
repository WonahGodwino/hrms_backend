-- Business Units (Core Setup). Company-scoped grouping of departments under a
-- cost centre / leadership. Additive & idempotent-friendly: creates two tables
-- and adds departments.businessUnitId (nullable FK). Existing rows unaffected;
-- Department.businessUnit (name string) is retained for back-compat and kept in
-- sync by the app.

-- 1. business_units
CREATE TABLE "business_units" (
  "id"              TEXT NOT NULL,
  "companyId"       TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "code"            TEXT,
  "costCenter"      TEXT,
  "description"     TEXT,
  "headId"          TEXT,
  "assistantHeadId" TEXT,
  "status"          TEXT NOT NULL DEFAULT 'Active',
  "createdBy"       TEXT,
  "updatedBy"       TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  "archived"        INTEGER DEFAULT 0,
  CONSTRAINT "business_units_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "business_units_companyId_status_idx" ON "business_units"("companyId", "status");
CREATE INDEX "business_units_companyId_archived_idx" ON "business_units"("companyId", "archived");

ALTER TABLE "business_units"
  ADD CONSTRAINT "business_units_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_units"
  ADD CONSTRAINT "business_units_headId_fkey"
  FOREIGN KEY ("headId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "business_units"
  ADD CONSTRAINT "business_units_assistantHeadId_fkey"
  FOREIGN KEY ("assistantHeadId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. business_unit_audit_logs
CREATE TABLE "business_unit_audit_logs" (
  "id"              TEXT NOT NULL,
  "businessUnitId"  TEXT NOT NULL,
  "companyId"       TEXT NOT NULL,
  "action"          TEXT NOT NULL,
  "performedBy"     TEXT,
  "performedByName" TEXT,
  "details"         TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_unit_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "business_unit_audit_logs_businessUnitId_createdAt_idx" ON "business_unit_audit_logs"("businessUnitId", "createdAt");
CREATE INDEX "business_unit_audit_logs_companyId_idx" ON "business_unit_audit_logs"("companyId");

ALTER TABLE "business_unit_audit_logs"
  ADD CONSTRAINT "business_unit_audit_logs_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. departments.businessUnitId (nullable FK)
ALTER TABLE "departments" ADD COLUMN "businessUnitId" TEXT;
CREATE INDEX "departments_businessUnitId_idx" ON "departments"("businessUnitId");
ALTER TABLE "departments"
  ADD CONSTRAINT "departments_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- NOTE: staff_records table name assumed ("staff_records" per @@map). The
-- StaffRecord.headOfBusinessUnit / assistantHeadOfBusinessUnit relations are the
-- inverse side of business_units.headId / assistantHeadId and need no columns.
