-- Migration: 20260626000001_company_registration_fields
-- Adds company profile / system-config columns required by the
-- POST /api/auth/companies/register endpoint, plus a locations table.
-- Column names are camelCase to match Prisma's default column generation.

-- New columns on companies
ALTER TABLE "companies" ADD COLUMN "tradingName" TEXT;
ALTER TABLE "companies" ADD COLUMN "rcNumber" TEXT;
ALTER TABLE "companies" ADD COLUMN "industry" TEXT;
ALTER TABLE "companies" ADD COLUMN "website" TEXT;
ALTER TABLE "companies" ADD COLUMN "biography" TEXT;
ALTER TABLE "companies" ADD COLUMN "fiscalYearStart" TEXT;
ALTER TABLE "companies" ADD COLUMN "leaveYearStart" TEXT;
ALTER TABLE "companies" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'Active';

-- Company locations
CREATE TABLE "locations" (
    "id"        TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "type"      TEXT,
    "state"     TEXT,
    "lga"       TEXT,
    "address"   TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "locations_companyId_idx" ON "locations"("companyId");

ALTER TABLE "locations" ADD CONSTRAINT "locations_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
