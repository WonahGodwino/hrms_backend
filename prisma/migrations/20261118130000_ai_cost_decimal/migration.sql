-- DB-004 step 2 (owner-approved 2026-11-18): AI and CV-screening cost columns are stored
-- as exact amounts (DECIMAL(18,6)) instead of floating-point numbers.
-- Generated with `prisma migrate diff` (offline).

-- AlterTable
ALTER TABLE "ai_settings" ALTER COLUMN "monthlyBudget" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "costPerReview" SET DATA TYPE DECIMAL(18,6);

-- AlterTable
ALTER TABLE "ai_usage_logs" ALTER COLUMN "cost" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "actualCost" SET DATA TYPE DECIMAL(18,6);

-- AlterTable
ALTER TABLE "token_cost_configs" ALTER COLUMN "costPerUnit" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "providerCostPerUnit" SET DATA TYPE DECIMAL(18,6);

-- AlterTable
ALTER TABLE "cv_screening_usage_logs" ALTER COLUMN "cost" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "actualCost" SET DATA TYPE DECIMAL(18,6);

