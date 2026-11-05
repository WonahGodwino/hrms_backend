-- Device location on every clock-in / clock-out (record only, no geofence).
-- Purely additive nullable columns — existing attendance rows are untouched.
-- Written by hand (not `migrate dev`) because the shared database holds
-- tables this branch's schema doesn't know about, and a generated diff would
-- have dropped them.
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "signInLatitude" DOUBLE PRECISION;
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "signInLongitude" DOUBLE PRECISION;
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "signInAccuracy" DOUBLE PRECISION;
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "signOutLatitude" DOUBLE PRECISION;
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "signOutLongitude" DOUBLE PRECISION;
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "signOutAccuracy" DOUBLE PRECISION;
