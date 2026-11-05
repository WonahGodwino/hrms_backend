-- AlterTable
ALTER TABLE "payrolls" ADD COLUMN "pensionRsaPinSnapshot" TEXT,
ADD COLUMN "pensionPfaCodeSnapshot" TEXT,
ADD COLUMN "pensionEmployerCodeSnapshot" TEXT,
ADD COLUMN "pensionSnapshotAt" TIMESTAMP(3);
