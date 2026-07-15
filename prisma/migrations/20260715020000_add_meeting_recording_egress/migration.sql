-- Track the active LiveKit Egress recording id so a running recording can be
-- stopped later (additive, nullable — safe on existing rows).
ALTER TABLE "meetings" ADD COLUMN "recordingEgressId" TEXT;
