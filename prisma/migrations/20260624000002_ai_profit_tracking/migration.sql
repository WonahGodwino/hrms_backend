-- Migration: 20260624000002_ai_profit_tracking
-- Adds provider (actual) cost tracking so SUPER_ADMIN can see profit:
--   profit = revenue (billed cost) - actualCost (what we pay the AI provider)
-- All changes are additive; no data is dropped or modified.

-- 1. Provider cost rate on the token cost config (what WE pay per unit).
--    costPerUnit = what we charge tenants; providerCostPerUnit = our real cost.
ALTER TABLE "token_cost_configs"
    ADD COLUMN IF NOT EXISTS "providerCostPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0.015;

-- 2. Actual provider cost stored per usage log (historical accuracy).
--    Existing rows default to 0; new runs populate it from the active rate.
ALTER TABLE "ai_usage_logs"
    ADD COLUMN IF NOT EXISTS "actualCost" DOUBLE PRECISION NOT NULL DEFAULT 0;
