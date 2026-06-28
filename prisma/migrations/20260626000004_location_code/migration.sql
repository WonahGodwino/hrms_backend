-- Migration: 20260626000004_location_code
-- Adds a human-friendly per-company location code (e.g. "RIV-088").
-- Nullable for back-compat with any locations created before this change.
-- Postgres treats NULLs as distinct, so the unique index permits multiple
-- legacy rows without a code.

ALTER TABLE "locations" ADD COLUMN "code" TEXT;

CREATE UNIQUE INDEX "locations_companyId_code_key" ON "locations"("companyId", "code");
