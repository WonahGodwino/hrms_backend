-- CreateTable
CREATE TABLE "leave_uploads" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "policiesCreated" INTEGER NOT NULL DEFAULT 0,
    "policiesFailed" INTEGER NOT NULL DEFAULT 0,
    "leaveTypesCreated" INTEGER NOT NULL DEFAULT 0,
    "leaveTypesFailed" INTEGER NOT NULL DEFAULT 0,
    "holidaysCreated" INTEGER NOT NULL DEFAULT 0,
    "holidaysFailed" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT[],
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_uploads_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "leave_uploads" ADD CONSTRAINT "leave_uploads_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
