-- AlterTable
ALTER TABLE "payroll_uploads" ADD COLUMN     "emailAttempts" INTEGER,
ADD COLUMN     "emailsSent" INTEGER,
ADD COLUMN     "payslipsGenerated" INTEGER,
ADD COLUMN     "payslipsUpdated" INTEGER;
