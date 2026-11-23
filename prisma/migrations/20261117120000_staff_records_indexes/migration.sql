-- DB-003: indexes for company-scoped staff lists and for department, manager
-- and designation lookups on staff_records. Purely additive: no table,
-- column or data change.
--
-- Hand-written in Prisma's format (matching schema.prisma's new @@index
-- lines and Prisma's default index names), following the convention noted in
-- 20261113160000_create_cv_screening_tables: `migrate dev` cannot diff this
-- database because of known drift. IF NOT EXISTS keeps it safe to apply where
-- an index was already created by hand.
--
-- Lock note: plain CREATE INDEX briefly blocks writes to staff_records while
-- each index builds. On a large table, apply outside working hours, or create
-- the indexes beforehand with CREATE INDEX CONCURRENTLY (same names) and
-- this migration then does nothing.
--
-- NOT APPLIED. Applying it to any database needs the owner's explicit go-ahead.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_records_companyId_isActive_idx" ON "staff_records"("companyId", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_records_departmentId_idx" ON "staff_records"("departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_records_managerId_idx" ON "staff_records"("managerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_records_designationId_idx" ON "staff_records"("designationId");
