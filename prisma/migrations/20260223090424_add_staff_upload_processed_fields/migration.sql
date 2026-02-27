-- AlterTable
ALTER TABLE "payrolls" ADD COLUMN     "communicationAllowance" DECIMAL(18,2),
ADD COLUMN     "outstandingIncome" DECIMAL(18,2),
ADD COLUMN     "overtimeIncome" DECIMAL(18,2),
ADD COLUMN     "transportationAllowance" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "staff_uploads" ADD COLUMN     "processedFileName" TEXT,
ADD COLUMN     "processedFilePath" TEXT;
