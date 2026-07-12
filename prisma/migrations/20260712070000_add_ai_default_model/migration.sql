-- Migration: Add default AI model configuration to token_cost_configs
-- Description: Allows SUPER_ADMIN to set the default AI service and model system-wide
-- Date: 2026-07-12

-- Add default AI service column (safe — skips if already exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'token_cost_configs' AND column_name = 'defaultAiService'
    ) THEN
        ALTER TABLE "token_cost_configs" ADD COLUMN "defaultAiService" TEXT;
    END IF;
END $$;

-- Add default AI model column (safe — skips if already exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'token_cost_configs' AND column_name = 'defaultAiModel'
    ) THEN
        ALTER TABLE "token_cost_configs" ADD COLUMN "defaultAiModel" TEXT;
    END IF;
END $$;
