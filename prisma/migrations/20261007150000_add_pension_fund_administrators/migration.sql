-- CreateTable
CREATE TABLE "pension_fund_administrators" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pension_fund_administrators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pension_fund_administrators_code_key" ON "pension_fund_administrators"("code");

-- Seed: a starting list of PFAs, generated from general knowledge and NOT
-- verified against PenCom's current register. The "code" values are
-- provisional internal shorthand (PenCom does not publish a standard
-- numeric/alpha code per PFA) — review and correct both the list and the
-- codes via the PFA admin screen before relying on this in production.
INSERT INTO "pension_fund_administrators" ("id", "code", "name", "isActive", "createdAt", "updatedAt") VALUES
    ('pfa_seed_arm', 'ARM', 'ARM Pension Managers Limited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pfa_seed_fidelity', 'FIDELITY', 'Fidelity Pension Managers Limited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pfa_seed_fcmb', 'FCMB', 'FCMB Pensions Limited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pfa_seed_leadway', 'LEADWAY', 'Leadway Pensure PFA Limited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pfa_seed_nlpc', 'NLPC', 'NLPC Pension Fund Administrators Limited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pfa_seed_norrenberger', 'NORRENBERGER', 'Norrenberger Pensions Limited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pfa_seed_oak', 'OAK', 'OAK Pensions Limited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pfa_seed_pal', 'PAL', 'Pensions Alliance Limited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pfa_seed_premium', 'PREMIUM', 'Premium Pension Limited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pfa_seed_radix', 'RADIX', 'Radix Pension Fund Managers Limited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pfa_seed_stanbic', 'STANBIC', 'Stanbic IBTC Pension Managers Limited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pfa_seed_sigma', 'SIGMA', 'Sigma Pensions Limited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pfa_seed_tangerine', 'TANGERINE', 'Tangerine APT Pensions Limited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pfa_seed_trustfund', 'TRUSTFUND', 'Trustfund Pensions Limited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pfa_seed_veritas', 'VERITAS', 'Veritas Glanvills Pensions Limited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pfa_seed_crusadersterling', 'CRUSADERSTERLING', 'CrusaderSterling Pensions Limited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
