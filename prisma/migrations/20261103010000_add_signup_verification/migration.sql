-- CreateTable
CREATE TABLE "SignupVerification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "emailCodeHash" VARCHAR(128),
    "emailCodeExpiresAt" TIMESTAMP(3),
    "emailAttempts" INTEGER NOT NULL DEFAULT 0,
    "phoneCodeHash" VARCHAR(128),
    "phoneCodeExpiresAt" TIMESTAMP(3),
    "phoneAttempts" INTEGER NOT NULL DEFAULT 0,
    "emailVerifiedAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "riskDecision" VARCHAR(20) NOT NULL,
    "riskReasons" JSONB,
    "ipHash" VARCHAR(128),
    "deviceHash" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignupVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignupVerification_companyId_key" ON "SignupVerification"("companyId");

-- CreateIndex
CREATE INDEX "SignupVerification_email_idx" ON "SignupVerification"("email");

-- AddForeignKey
ALTER TABLE "SignupVerification" ADD CONSTRAINT "SignupVerification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
