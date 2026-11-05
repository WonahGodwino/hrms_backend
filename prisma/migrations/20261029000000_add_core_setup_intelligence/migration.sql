-- Core Setup intelligence: Automation Center settings and runs, Action Center decisions, and the Core Setup change feed (Activity Log).
-- Purely additive and idempotent.

CREATE TABLE IF NOT EXISTS "automation_rule_settings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "overrides" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "automation_rule_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "automation_rule_settings_companyId_ruleId_key"
    ON "automation_rule_settings"("companyId", "ruleId");
CREATE INDEX IF NOT EXISTS "automation_rule_settings_companyId_idx"
    ON "automation_rule_settings"("companyId");

CREATE TABLE IF NOT EXISTS "action_item_decisions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "applied" INTEGER NOT NULL DEFAULT 0,
    "value" TEXT,
    "signature" TEXT,
    "title" TEXT,
    "ruleId" TEXT,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedByRole" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "action_item_decisions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "action_item_decisions_companyId_itemKey_key"
    ON "action_item_decisions"("companyId", "itemKey");
CREATE INDEX IF NOT EXISTS "action_item_decisions_companyId_decidedAt_idx"
    ON "action_item_decisions"("companyId", "decidedAt");

CREATE TABLE IF NOT EXISTS "automation_runs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "detail" TEXT,
    "evaluated" INTEGER NOT NULL DEFAULT 0,
    "exceptions" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "error" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "automation_runs_companyId_createdAt_idx"
    ON "automation_runs"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "automation_runs_companyId_ruleId_idx"
    ON "automation_runs"("companyId", "ruleId");

CREATE TABLE IF NOT EXISTS "core_setup_audit_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "correlationId" TEXT,
    "kind" TEXT NOT NULL,
    "area" TEXT,
    "via" TEXT,
    "action" TEXT NOT NULL,
    "changeType" TEXT,
    "source" TEXT,
    "object" TEXT,
    "summary" TEXT,
    "reason" TEXT,
    "status" TEXT,
    "result" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "actorRole" TEXT,
    "fieldChanges" JSONB,
    "relatedRecords" JSONB,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "core_setup_audit_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "core_setup_audit_events_companyId_createdAt_idx"
    ON "core_setup_audit_events"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "core_setup_audit_events_companyId_kind_idx"
    ON "core_setup_audit_events"("companyId", "kind");

DO $$
BEGIN
    ALTER TABLE "automation_rule_settings"
        ADD CONSTRAINT "automation_rule_settings_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "action_item_decisions"
        ADD CONSTRAINT "action_item_decisions_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "automation_runs"
        ADD CONSTRAINT "automation_runs_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "core_setup_audit_events"
        ADD CONSTRAINT "core_setup_audit_events_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
