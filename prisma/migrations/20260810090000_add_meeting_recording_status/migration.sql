-- Track recording lifecycle authoritatively (confirmed by the LiveKit egress
-- webhook, not just the start/stop call) and the S3 object key used to
-- generate signed playback URLs on demand. Additive, nullable, idempotent —
-- safe to re-run and safe on existing rows.
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "recordingKey" TEXT;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "recordingStatus" TEXT;
