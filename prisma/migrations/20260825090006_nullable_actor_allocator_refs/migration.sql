-- Required so a permanent staff delete can null out these references (this
-- staff acting on someone ELSE's training log entry / benefit allocation)
-- before deleting the StaffRecord, instead of being blocked by the FK
-- constraint. The logged action / allocation itself is preserved; only the
-- link to the now-deleted staff member is cleared.
ALTER TABLE "training_audit_logs" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "benefit_allocations" ALTER COLUMN "allocatedBy" DROP NOT NULL;
