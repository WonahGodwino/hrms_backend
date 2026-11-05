-- Readable street address for the clock-in and clock-out locations
-- (reverse geocoded from the stored coordinates). Purely additive nullable
-- columns. Written by hand (not `migrate dev`) because the shared database
-- holds tables this branch's schema doesn't know about, and a generated diff
-- would have dropped them.
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "signInAddress" TEXT;
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "signOutAddress" TEXT;
