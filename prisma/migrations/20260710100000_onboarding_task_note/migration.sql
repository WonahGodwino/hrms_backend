-- Additive, idempotent: adds an optional free-text note to onboarding tasks.
-- Safe to run against production; no data is modified or dropped.
ALTER TABLE "onboarding_tasks" ADD COLUMN IF NOT EXISTS "note" TEXT;
