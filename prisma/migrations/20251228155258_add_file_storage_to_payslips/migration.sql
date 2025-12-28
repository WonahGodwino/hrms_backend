-- AlterTable
ALTER TABLE "payslips" ADD COLUMN     "fileData" BYTEA,
ADD COLUMN     "fileSize" INTEGER,
ADD COLUMN     "fileType" TEXT NOT NULL DEFAULT 'application/pdf',
ALTER COLUMN "filePath" DROP NOT NULL;
