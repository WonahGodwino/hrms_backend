-- Hand-authored, same reason as 20260902120000_add_payroll_generation_module:
-- this repo's shadow-database replay currently fails on an unrelated
-- pre-existing migration (20260524200411_add_loans_and_benefits), so
-- `prisma migrate dev` can't compute a diff. This file is safe to apply
-- with `prisma migrate deploy` (no shadow database involved) and follows
-- the same idempotent `IF NOT EXISTS` style already used elsewhere here,
-- so it is also safe to have already been applied via `prisma db push`
-- ahead of deployment, deploy will find the column already present and
-- simply record this migration as applied, no error.

-- Staff excluded from a specific company+template+payPeriod generation run
-- (e.g. someone on unpaid leave that period). Defaults to an empty array so
-- existing runs behave exactly as before (nobody excluded).
ALTER TABLE "payroll_generation_runs" ADD COLUMN IF NOT EXISTS "excludedStaffIds" TEXT[] NOT NULL DEFAULT '{}';
