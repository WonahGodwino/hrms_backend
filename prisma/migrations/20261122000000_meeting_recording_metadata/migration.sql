-- Additive, non-destructive: recording duration/size metadata, filled by the
-- LiveKit egress_ended webhook once the MP4 lands in object storage.

ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "recordingDurationSeconds" INTEGER;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "recordingSizeBytes" INTEGER;
