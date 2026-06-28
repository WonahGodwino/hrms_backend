-- Migration: 20260624000001_token_cost_config
-- Creates the global token cost configuration table.
-- Column names are camelCase (no @map on fields) to match Prisma's default
-- column name generation, consistent with AIUsageLog and AISettings models.

CREATE TABLE "token_cost_configs" (
    "id"           TEXT NOT NULL,
    "tokensPerUnit" INTEGER NOT NULL DEFAULT 1000,
    "costPerUnit"  DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    "currency"     VARCHAR(3) NOT NULL DEFAULT 'USD',
    "label"        TEXT,
    "isActive"     BOOLEAN NOT NULL DEFAULT false,
    "createdBy"    TEXT NOT NULL,
    "updatedBy"    TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_cost_configs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "token_cost_configs_isActive_idx" ON "token_cost_configs"("isActive");
CREATE INDEX "token_cost_configs_createdAt_idx" ON "token_cost_configs"("createdAt");

-- Seed the default rate: 1000 tokens charged at $0.30 USD.
-- The providerCostPerUnit column is added in migration 20260624000002 and
-- defaults to $0.10, giving this seeded active rate a 67% profit margin.
INSERT INTO "token_cost_configs" (
    "id", "tokensPerUnit", "costPerUnit", "currency",
    "label", "isActive", "createdBy", "updatedAt"
) VALUES (
    'default_token_rate', 1000, 0.30, 'USD',
    'Default rate (1,000 tokens = $0.30 charge, $0.10 cost)', true, 'system', CURRENT_TIMESTAMP
);
