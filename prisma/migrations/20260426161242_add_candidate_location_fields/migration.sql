-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "applicationStartDate" TIMESTAMP(3),
ADD COLUMN     "locationLga" TEXT,
ADD COLUMN     "locationState" TEXT;
