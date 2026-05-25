-- CreateTable: platform module registry
CREATE TABLE "platform_modules" (
    "id"          TEXT NOT NULL,
    "key"         TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_modules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_modules_key_key" ON "platform_modules"("key");

-- CreateTable: company × module access matrix
CREATE TABLE "company_module_access" (
    "id"        TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "moduleId"  TEXT NOT NULL,
    "enabled"   BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_module_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_module_access_companyId_moduleId_key"
    ON "company_module_access"("companyId", "moduleId");

-- AddForeignKey
ALTER TABLE "company_module_access"
    ADD CONSTRAINT "company_module_access_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_module_access"
    ADD CONSTRAINT "company_module_access_moduleId_fkey"
    FOREIGN KEY ("moduleId") REFERENCES "platform_modules"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
