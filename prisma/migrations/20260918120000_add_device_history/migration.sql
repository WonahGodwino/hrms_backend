-- Device history — instead of hard-deleting a device row when a staff member
-- evicts it to make room for a 4th device, the row is archived so the account
-- keeps a record of every device it has ever used. Additive only, nothing
-- existing is altered.

ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "devices_staffRecordId_archivedAt_idx" ON "devices"("staffRecordId", "archivedAt");
