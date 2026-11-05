-- Guided Setup journey state, per company.
CREATE TABLE "guided_setup_states" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "completedStages" JSONB NOT NULL,
    "started" BOOLEAN NOT NULL DEFAULT false,
    "exited" BOOLEAN NOT NULL DEFAULT false,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guided_setup_states_pkey" PRIMARY KEY ("id")
);

-- One state row per company.
CREATE UNIQUE INDEX "guided_setup_states_companyId_key" ON "guided_setup_states"("companyId");

ALTER TABLE "guided_setup_states" ADD CONSTRAINT "guided_setup_states_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
