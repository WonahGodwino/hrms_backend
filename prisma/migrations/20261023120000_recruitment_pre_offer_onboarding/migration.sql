-- Recruitment flow redesign: pre-offer onboarding (handbook + checklist +
-- candidate agreement) now happens BEFORE an Offer exists, not after.
-- Hand-authored (not via `prisma migrate dev`) to avoid a shadow-database
-- diff/reset against this database's long-accumulated drift — see
-- 20260629094522_baseline_offboardings_table for background. Safe to apply
-- directly via `prisma migrate deploy` / `prisma db execute`.
--
-- Per explicit user decision, no production data needs to be preserved for
-- this feature (clean slate) — the 4 existing `onboardings` rows belong to
-- the old post-offer-only flow being replaced here and are cleared so
-- `applicationId` can be added as NOT NULL UNIQUE without a backfill.

DELETE FROM "onboardings";

-- ─── onboardings: offerId becomes optional, applicationId becomes the anchor ───
ALTER TABLE "onboardings" ALTER COLUMN "offerId" DROP NOT NULL;
ALTER TABLE "onboardings" ADD COLUMN "applicationId" TEXT;
ALTER TABLE "onboardings" ADD COLUMN "templateId" TEXT;
ALTER TABLE "onboardings" ADD COLUMN "handbookAcknowledgedAt" TIMESTAMP(3);
ALTER TABLE "onboardings" ADD COLUMN "candidateAgreedAt" TIMESTAMP(3);
ALTER TABLE "onboardings" ADD COLUMN "metadata" JSONB;
ALTER TABLE "onboardings" ALTER COLUMN "applicationId" SET NOT NULL;

CREATE UNIQUE INDEX "onboardings_applicationId_key" ON "onboardings"("applicationId");

ALTER TABLE "onboardings" ADD CONSTRAINT "onboardings_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── onboarding_templates ───
CREATE TABLE "onboarding_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archived" INTEGER DEFAULT 0,
    CONSTRAINT "onboarding_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "onboarding_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "onboarding_templates_companyId_status_idx" ON "onboarding_templates"("companyId", "status");
CREATE INDEX "onboarding_templates_companyId_archived_idx" ON "onboarding_templates"("companyId", "archived");

-- ─── onboarding_template_tasks ───
CREATE TABLE "onboarding_template_tasks" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "assignee" TEXT,
    "dueOffsetDays" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "onboarding_template_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "onboarding_template_tasks_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "onboarding_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "onboarding_template_tasks_templateId_order_key" ON "onboarding_template_tasks"("templateId", "order");

ALTER TABLE "onboardings" ADD CONSTRAINT "onboardings_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "onboarding_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── ApplicationStatus: new pre-offer-onboarding stage ───
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'PRE_OFFER_ONBOARDING';

-- ─── companies: per-company handbook shown to candidates during onboarding ───
ALTER TABLE "companies" ADD COLUMN "handbookPath" TEXT;
ALTER TABLE "companies" ADD COLUMN "handbookFileName" TEXT;
ALTER TABLE "companies" ADD COLUMN "handbookUpdatedAt" TIMESTAMP(3);
