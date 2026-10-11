-- ============================================================
-- Bulk Staff Promotion Letter Automation (salary-increase letters)
-- SAFE / IDEMPOTENT migration — production.
--   - CREATE TABLE IF NOT EXISTS
--   - CREATE [UNIQUE] INDEX IF NOT EXISTS
--   - FK constraints added inside DO blocks guarded against duplicate_object
-- No destructive statements (no DROP, no ALTER of existing tables/types).
-- Status/type columns are TEXT (validated in application code) — no enum changes.
-- ============================================================

CREATE TABLE IF NOT EXISTS "phed_letter_templates" (
    "id"             TEXT NOT NULL,
    "companyId"      TEXT NOT NULL,
    "type"           TEXT NOT NULL DEFAULT 'SALARY_INCREASE',
    "version"        INTEGER NOT NULL DEFAULT 1,
    "body"           TEXT NOT NULL,
    "letterhead"     TEXT NOT NULL,
    "signatoryName"  TEXT NOT NULL,
    "signatoryTitle" TEXT NOT NULL,
    "tokens"         JSONB NOT NULL,
    "createdById"    TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "phed_letter_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "phed_letter_runs" (
    "id"               TEXT NOT NULL,
    "companyId"        TEXT NOT NULL,
    "operatorId"       TEXT NOT NULL,
    "sourceFileName"   TEXT NOT NULL,
    "sourceFileSize"   INTEGER NOT NULL,
    "sourceFileSha256" TEXT NOT NULL,
    "storageKey"       TEXT,
    "runInputs"        JSONB NOT NULL,
    "templateId"       TEXT,
    "templateVersion"  INTEGER,
    "status"           TEXT NOT NULL DEFAULT 'VALIDATING',
    "counts"           JSONB,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"      TIMESTAMP(3),
    "filesExpireAt"    TIMESTAMP(3),
    CONSTRAINT "phed_letter_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "phed_letter_run_rows" (
    "id"         TEXT NOT NULL,
    "runId"      TEXT NOT NULL,
    "companyId"  TEXT NOT NULL,
    "excelRow"   INTEGER NOT NULL,
    "employeeId" TEXT NOT NULL,
    "values"     JSONB,
    "findings"   JSONB,
    "status"     TEXT NOT NULL DEFAULT 'PENDING',
    "outputKey"  TEXT,
    "error"      TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "phed_letter_run_rows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "phed_letter_audit_events" (
    "id"        TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId"   TEXT,
    "action"    TEXT NOT NULL,
    "runId"     TEXT,
    "detail"    TEXT,
    "ip"        TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "phed_letter_audit_events_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "phed_letter_templates_companyId_type_version_idx"
    ON "phed_letter_templates"("companyId", "type", "version");
CREATE INDEX IF NOT EXISTS "phed_letter_runs_companyId_createdAt_idx"
    ON "phed_letter_runs"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "phed_letter_runs_companyId_status_idx"
    ON "phed_letter_runs"("companyId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "phed_letter_run_rows_runId_employeeId_key"
    ON "phed_letter_run_rows"("runId", "employeeId");
CREATE INDEX IF NOT EXISTS "phed_letter_run_rows_companyId_runId_idx"
    ON "phed_letter_run_rows"("companyId", "runId");
CREATE INDEX IF NOT EXISTS "phed_letter_audit_events_companyId_createdAt_idx"
    ON "phed_letter_audit_events"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "phed_letter_audit_events_runId_idx"
    ON "phed_letter_audit_events"("runId");

-- ── Foreign keys (idempotent) ────────────────────────────────
DO $$ BEGIN
    ALTER TABLE "phed_letter_templates"
        ADD CONSTRAINT "phed_letter_templates_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "phed_letter_runs"
        ADD CONSTRAINT "phed_letter_runs_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "phed_letter_run_rows"
        ADD CONSTRAINT "phed_letter_run_rows_runId_fkey"
        FOREIGN KEY ("runId") REFERENCES "phed_letter_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "phed_letter_run_rows"
        ADD CONSTRAINT "phed_letter_run_rows_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "phed_letter_audit_events"
        ADD CONSTRAINT "phed_letter_audit_events_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
