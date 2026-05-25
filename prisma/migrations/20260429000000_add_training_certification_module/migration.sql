-- Training & Certification Module
-- CreateTable training_programs
CREATE TABLE "training_programs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "programName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "trainingType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'Beginner',
    "departments" TEXT[],
    "trainer" TEXT NOT NULL,
    "durationHours" DECIMAL(6,2),
    "sessionType" TEXT NOT NULL DEFAULT 'Single',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "maxParticipants" INTEGER,
    "assessmentRequired" BOOLEAN NOT NULL DEFAULT true,
    "assessmentType" TEXT DEFAULT 'Quiz',
    "passingScore" INTEGER NOT NULL DEFAULT 80,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "autoCertificate" BOOLEAN NOT NULL DEFAULT true,
    "assignmentMethod" TEXT NOT NULL DEFAULT 'Automatic Enrollment',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "notifyEmployees" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "training_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable training_sessions
CREATE TABLE "training_sessions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "trainingProgramId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Upcoming',
    "trainer" TEXT,
    "capacity" INTEGER,
    "participantsCount" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT,
    "duration" TEXT,
    "summary" TEXT,
    "programLabel" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable training_materials
CREATE TABLE "training_materials" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "trainingProgramId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "fileUrl" TEXT,
    "externalUrl" TEXT,
    "description" TEXT,
    "studyTimeMinutes" INTEGER NOT NULL DEFAULT 15,
    "fileSizeBytes" BIGINT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable assessments
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "trainingProgramId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "timeLimitMinutes" INTEGER,
    "passingScore" INTEGER NOT NULL,
    "maxAttempts" INTEGER,
    "category" TEXT,
    "difficulty" TEXT,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable questions
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT,
    "type" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctOptionId" TEXT,
    "correctBoolean" TEXT,
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 5,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "tags" TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT true,
    "shuffleAnswers" BOOLEAN NOT NULL DEFAULT false,
    "multipleSelections" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable assessment_attempts
CREATE TABLE "assessment_attempts" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "outcome" TEXT,
    "score" INTEGER,
    "timeTakenSeconds" INTEGER,
    "responses" JSONB,
    "retakeAllowed" BOOLEAN NOT NULL DEFAULT false,
    "isManualReview" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable participant_progress
CREATE TABLE "participant_progress" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "trainingProgramId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "trainingStatus" TEXT NOT NULL DEFAULT 'NOT STARTED',
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER,
    "certStatus" TEXT NOT NULL DEFAULT 'NOT CERTIFIED',
    "completionDate" TIMESTAMP(3),
    "timeSpentSeconds" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "timeline" JSONB,
    "materialsProgress" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable certification_templates
CREATE TABLE "certification_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fieldsSchema" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable certification_types
CREATE TABLE "certification_types" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "templateId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certification_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable certification_records
CREATE TABLE "certification_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "certificationTypeId" TEXT NOT NULL,
    "certIdNumber" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "duration" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "daysToExpiry" INTEGER,
    "hasDocument" BOOLEAN NOT NULL DEFAULT false,
    "issuedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certification_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable certification_documents
CREATE TABLE "certification_documents" (
    "id" TEXT NOT NULL,
    "certificationRecordId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT,
    "fileName" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certification_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable assignment_rules
CREATE TABLE "assignment_rules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "trigger" TEXT,
    "condition" JSONB,
    "trainingProgramId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "recurrenceValue" INTEGER,
    "recurrenceUnit" TEXT,
    "startOption" TEXT,
    "endOption" TEXT,
    "graceDays" INTEGER NOT NULL DEFAULT 7,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "scope" TEXT NOT NULL DEFAULT 'All Employees',
    "notifyOnAssignment" BOOLEAN NOT NULL DEFAULT true,
    "statusHandling" TEXT[],
    "escalateManager" BOOLEAN NOT NULL DEFAULT false,
    "preExpiryNotifications" INTEGER[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable risk_items
CREATE TABLE "risk_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT NOT NULL,
    "department" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "affectedUsers" JSONB,
    "primaryAction" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable training_audit_logs
CREATE TABLE "training_audit_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "training_programs_companyId_slug_key" ON "training_programs"("companyId", "slug");
CREATE INDEX "training_programs_companyId_status_idx" ON "training_programs"("companyId", "status");
CREATE INDEX "training_programs_companyId_category_idx" ON "training_programs"("companyId", "category");

CREATE INDEX "training_sessions_companyId_status_idx" ON "training_sessions"("companyId", "status");
CREATE INDEX "training_sessions_companyId_date_idx" ON "training_sessions"("companyId", "date");
CREATE INDEX "training_sessions_trainingProgramId_idx" ON "training_sessions"("trainingProgramId");

CREATE INDEX "training_materials_trainingProgramId_idx" ON "training_materials"("trainingProgramId");

CREATE UNIQUE INDEX "assessments_trainingProgramId_key" ON "assessments"("trainingProgramId");
CREATE INDEX "assessments_companyId_status_idx" ON "assessments"("companyId", "status");
CREATE INDEX "assessments_companyId_type_idx" ON "assessments"("companyId", "type");

CREATE INDEX "questions_assessmentId_order_idx" ON "questions"("assessmentId", "order");

CREATE UNIQUE INDEX "assessment_attempts_assessmentId_employeeId_attemptNumber_key" ON "assessment_attempts"("assessmentId", "employeeId", "attemptNumber");
CREATE INDEX "assessment_attempts_assessmentId_employeeId_idx" ON "assessment_attempts"("assessmentId", "employeeId");
CREATE INDEX "assessment_attempts_companyId_outcome_idx" ON "assessment_attempts"("companyId", "outcome");

CREATE UNIQUE INDEX "participant_progress_trainingProgramId_employeeId_key" ON "participant_progress"("trainingProgramId", "employeeId");
CREATE INDEX "participant_progress_companyId_trainingStatus_idx" ON "participant_progress"("companyId", "trainingStatus");
CREATE INDEX "participant_progress_companyId_certStatus_idx" ON "participant_progress"("companyId", "certStatus");

CREATE INDEX "certification_templates_companyId_idx" ON "certification_templates"("companyId");

CREATE INDEX "certification_types_companyId_type_idx" ON "certification_types"("companyId", "type");
CREATE INDEX "certification_types_companyId_isActive_idx" ON "certification_types"("companyId", "isActive");

CREATE INDEX "certification_records_companyId_status_idx" ON "certification_records"("companyId", "status");
CREATE INDEX "certification_records_companyId_employeeId_idx" ON "certification_records"("companyId", "employeeId");
CREATE INDEX "certification_records_companyId_expiryDate_idx" ON "certification_records"("companyId", "expiryDate");

CREATE INDEX "certification_documents_certificationRecordId_idx" ON "certification_documents"("certificationRecordId");

CREATE INDEX "assignment_rules_companyId_ruleType_idx" ON "assignment_rules"("companyId", "ruleType");
CREATE INDEX "assignment_rules_companyId_enabled_idx" ON "assignment_rules"("companyId", "enabled");

CREATE UNIQUE INDEX "risk_items_companyId_code_key" ON "risk_items"("companyId", "code");
CREATE INDEX "risk_items_companyId_severity_idx" ON "risk_items"("companyId", "severity");
CREATE INDEX "risk_items_companyId_status_idx" ON "risk_items"("companyId", "status");

CREATE INDEX "training_audit_logs_companyId_entityType_entityId_idx" ON "training_audit_logs"("companyId", "entityType", "entityId");
CREATE INDEX "training_audit_logs_companyId_actorId_idx" ON "training_audit_logs"("companyId", "actorId");
CREATE INDEX "training_audit_logs_companyId_createdAt_idx" ON "training_audit_logs"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "training_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "training_materials" ADD CONSTRAINT "training_materials_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_materials" ADD CONSTRAINT "training_materials_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "training_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessments" ADD CONSTRAINT "assessments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "training_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "questions" ADD CONSTRAINT "questions_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "participant_progress" ADD CONSTRAINT "participant_progress_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "participant_progress" ADD CONSTRAINT "participant_progress_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "training_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "participant_progress" ADD CONSTRAINT "participant_progress_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "certification_templates" ADD CONSTRAINT "certification_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "certification_types" ADD CONSTRAINT "certification_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "certification_types" ADD CONSTRAINT "certification_types_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "certification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "certification_records" ADD CONSTRAINT "certification_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "certification_records" ADD CONSTRAINT "certification_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "certification_records" ADD CONSTRAINT "certification_records_certificationTypeId_fkey" FOREIGN KEY ("certificationTypeId") REFERENCES "certification_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "certification_documents" ADD CONSTRAINT "certification_documents_certificationRecordId_fkey" FOREIGN KEY ("certificationRecordId") REFERENCES "certification_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "training_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "risk_items" ADD CONSTRAINT "risk_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "training_audit_logs" ADD CONSTRAINT "training_audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_audit_logs" ADD CONSTRAINT "training_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
