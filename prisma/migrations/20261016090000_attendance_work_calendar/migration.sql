-- Attendance work calendar (Attendance Settings page).
-- Purely additive: a nullable closing time per company and a holiday type.
-- Application code falls back to "17:00" when standardEndTime is null, and
-- every existing holiday becomes type PUBLIC — no behaviour change until a
-- company configures them. Written by hand (not `migrate dev`) because the
-- shared database holds tables this branch's schema doesn't know about, and
-- a generated diff would have dropped them.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "standardEndTime" VARCHAR(5);
ALTER TABLE "public_holidays" ADD COLUMN IF NOT EXISTS "type" VARCHAR(20) NOT NULL DEFAULT 'PUBLIC';
