ALTER TABLE "companies"
ADD COLUMN "baseCurrency" VARCHAR(3) NOT NULL DEFAULT 'NGN';

CREATE TABLE "company_exchange_rates" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "baseCurrency" VARCHAR(3) NOT NULL,
  "quoteCurrency" VARCHAR(3) NOT NULL,
  "rate" DECIMAL(20,8) NOT NULL,
  "source" TEXT DEFAULT 'MANUAL',
  "fetchedAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "company_exchange_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_exchange_rates_companyId_baseCurrency_quoteCurrency_key"
ON "company_exchange_rates"("companyId", "baseCurrency", "quoteCurrency");

CREATE INDEX "company_exchange_rates_companyId_updatedAt_idx"
ON "company_exchange_rates"("companyId", "updatedAt");

CREATE INDEX "company_exchange_rates_companyId_baseCurrency_idx"
ON "company_exchange_rates"("companyId", "baseCurrency");

ALTER TABLE "company_exchange_rates"
ADD CONSTRAINT "company_exchange_rates_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
