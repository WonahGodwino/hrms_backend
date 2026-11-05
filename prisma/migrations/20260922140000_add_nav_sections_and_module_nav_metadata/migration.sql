-- Sidebar categorization: nav sections + per-module sidebar placement metadata.
CREATE TABLE "nav_sections" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nav_sections_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "platform_modules" ADD COLUMN "navSectionId" TEXT;
ALTER TABLE "platform_modules" ADD COLUMN "navOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "platform_modules" ADD COLUMN "navLabel" TEXT;
ALTER TABLE "platform_modules" ADD COLUMN "navIcon" TEXT;

CREATE INDEX "nav_sections_sortOrder_idx" ON "nav_sections"("sortOrder");
CREATE INDEX "platform_modules_navSectionId_idx" ON "platform_modules"("navSectionId");

ALTER TABLE "platform_modules" ADD CONSTRAINT "platform_modules_navSectionId_fkey" FOREIGN KEY ("navSectionId") REFERENCES "nav_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
