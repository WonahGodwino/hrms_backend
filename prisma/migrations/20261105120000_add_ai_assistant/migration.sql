-- AI Assistant (Ask 247HR): settings, platform switch, conversations, messages, proposals and custom automation rules.
-- Purely additive: 6 new tables, their indexes, one composite index on ai_usage_logs, and foreign keys to companies/ai_conversations.
-- Drafted with 'prisma migrate diff' (no database touched). Apply with 'prisma migrate deploy'.


-- CreateTable
CREATE TABLE "ai_assistant_settings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL DEFAULT 'anthropic',
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-5',
    "apiKeyEncrypted" TEXT,
    "keyLast4" VARCHAR(4),
    "lastTestedAt" TIMESTAMP(3),
    "keyStatus" TEXT NOT NULL DEFAULT 'none',
    "visibleCategories" JSONB NOT NULL DEFAULT '["employment","leave"]',
    "monthlyWarning" INTEGER,
    "hourlyLimit" INTEGER NOT NULL DEFAULT 20,
    "dailyLimit" INTEGER NOT NULL DEFAULT 500,
    "updatedById" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_assistant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_assistant_platform" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ai_assistant_platform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_proposals" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "conversationId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "originalPlan" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "result" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_automation_rules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT,
    "aiOrigin" BOOLEAN NOT NULL DEFAULT false,
    "recordType" TEXT NOT NULL DEFAULT 'staff',
    "cadence" TEXT NOT NULL DEFAULT 'daily',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "proposalId" TEXT,
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_assistant_settings_companyId_key" ON "ai_assistant_settings"("companyId");

-- CreateIndex
CREATE INDEX "ai_assistant_settings_companyId_idx" ON "ai_assistant_settings"("companyId");

-- CreateIndex
CREATE INDEX "ai_conversations_companyId_idx" ON "ai_conversations"("companyId");

-- CreateIndex
CREATE INDEX "ai_conversations_userId_idx" ON "ai_conversations"("userId");

-- CreateIndex
CREATE INDEX "ai_conversations_lastMessageAt_idx" ON "ai_conversations"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ai_messages_conversationId_idx" ON "ai_messages"("conversationId");

-- CreateIndex
CREATE INDEX "ai_messages_createdAt_idx" ON "ai_messages"("createdAt");

-- CreateIndex
CREATE INDEX "ai_proposals_companyId_status_idx" ON "ai_proposals"("companyId", "status");

-- CreateIndex
CREATE INDEX "ai_proposals_createdById_idx" ON "ai_proposals"("createdById");

-- CreateIndex
CREATE INDEX "ai_proposals_expiresAt_idx" ON "ai_proposals"("expiresAt");

-- CreateIndex
CREATE INDEX "custom_automation_rules_companyId_enabled_idx" ON "custom_automation_rules"("companyId", "enabled");

-- CreateIndex
CREATE INDEX "ai_usage_logs_companyId_service_createdAt_idx" ON "ai_usage_logs"("companyId", "service", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_assistant_settings" ADD CONSTRAINT "ai_assistant_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_automation_rules" ADD CONSTRAINT "custom_automation_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

