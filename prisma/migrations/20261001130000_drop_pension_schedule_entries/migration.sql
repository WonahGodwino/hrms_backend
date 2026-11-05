-- DropForeignKey
ALTER TABLE "pension_schedule_entries" DROP CONSTRAINT "pension_schedule_entries_companyId_fkey";

-- DropForeignKey
ALTER TABLE "pension_schedule_entries" DROP CONSTRAINT "pension_schedule_entries_staffRecordId_fkey";

-- DropTable
DROP TABLE "pension_schedule_entries";
