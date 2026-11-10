-- Tables, enums, indexes and foreign keys that schema.prisma declares but no
-- migration ever created: candidate portal (accounts, saved jobs, job alerts,
-- OTPs), staff career history, and the performance / appraisal / goals /
-- feedback / PIP / succession / fairness / intelligence / automation models.
--
-- Drafted from `prisma migrate diff` (live DB -> schema.prisma), keeping ONLY
-- additive statements. Everything the diff wanted to DROP or ALTER (grade-level
-- tables and columns, offboarding settlement columns, default changes) is left
-- out on purpose: those exist in the database but not in this branch's schema,
-- and dropping them would delete data. See the review note that came with this.
--
-- Guarded (IF NOT EXISTS / duplicate_object) so it is safe to re-run.
-- NOT applied. Review, then ship with `prisma migrate deploy`.
-- Runs after 20261109120000_recruitment_missing_columns (candidates.accountId FK).

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AccountDocumentCategory" AS ENUM ('RESUME', 'COVER_LETTER', 'CERTIFICATE', 'IDENTIFICATION', 'PORTFOLIO', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "CandidateOtpPurpose" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET', 'STATUS_LOOKUP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "JobAlertFrequency" AS ENUM ('INSTANT', 'DAILY', 'WEEKLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "CompetencyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "CompetencyCategory" AS ENUM ('CORE', 'LEADERSHIP', 'TECHNICAL', 'BEHAVIORAL', 'COMPLIANCE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "CompetencyReviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "CompetencyReviewOutcome" AS ENUM ('CONFIRMED', 'UPDATED', 'RETIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "TemplateType" AS ENUM ('PERFORMANCE_REVIEW', 'FEEDBACK_360', 'SELF_ASSESSMENT', 'MANAGER_CHECKIN', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "TemplateVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED', 'SUPERSEDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "QuestionType" AS ENUM ('RATING_SCALE', 'TEXT', 'MULTIPLE_CHOICE', 'COMPETENCY_RATING', 'GOAL_ASSESSMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AudienceType" AS ENUM ('SELF', 'MANAGER', 'PEER', 'SKIP_LEVEL', 'DIRECT_REPORT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AssignmentScopeType" AS ENUM ('ALL_DEPARTMENTS', 'SPECIFIC_DEPARTMENTS', 'CUSTOM_GROUP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'UNASSIGNED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AppraisalCycleType" AS ENUM ('ANNUAL', 'BI_ANNUAL', 'QUARTERLY', 'PROJECT_BASED', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AppraisalCycleStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ESCALATED', 'COMPLETED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AppraisalCycleScopeType" AS ENUM ('ALL_DEPARTMENTS', 'SPECIFIC_DEPARTMENTS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "ReviewPhaseType" AS ENUM ('SELF_APPRAISAL', 'MANAGER_REVIEW', 'PEER_REVIEW', 'LEADERSHIP_CALIBRATION', 'HR_VALIDATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "ApprovalRoutingType" AS ENUM ('MANAGER_SKIPLEVEL_HR', 'MANAGER_HR', 'MANAGER_DEPTHEAD_HR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "ParticipantPhaseStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AppraisalReminderRecipient" AS ENUM ('EMPLOYEE', 'DIRECT_MANAGER', 'DEPARTMENT_HEAD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PeerAssignmentSource" AS ENUM ('AUTO', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "ParticipantEnrollment" AS ENUM ('ACTIVATION', 'SYNC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "ParticipantExclusionReason" AS ENUM ('MANUAL', 'LEFT_COMPANY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "GoalPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "GoalStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'NEARING_COMPLETION', 'BLOCKED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "GoalLevel" AS ENUM ('COMPANY', 'DEPARTMENT', 'TEAM', 'INDIVIDUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "GoalAlignmentType" AS ENUM ('COMPANY_OKR', 'DEPARTMENT_OBJECTIVE', 'TEAM_INITIATIVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "KpiImpact" AS ENUM ('HIGH_IMPACT', 'MEDIUM_IMPACT', 'LOW_IMPACT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "GoalPerformanceCategory" AS ENUM ('PRODUCTIVITY', 'QUALITY', 'COLLABORATION', 'TIMELINESS', 'INNOVATION', 'LEADERSHIP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "GoalCommentType" AS ENUM ('MANAGER_ACKNOWLEDGEMENT', 'GENERAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "KpiMeasurementMethod" AS ENUM ('MANUAL', 'AUTOMATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "GoalConflictStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "GoalConflictResolutionAction" AS ENUM ('EXTEND_DEADLINE', 'REASSIGN', 'REPRIORITIZE', 'DESCOPE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "GoalActivityType" AS ENUM ('UPDATE', 'MILESTONE', 'BLOCKER', 'ANNOUNCEMENT', 'RECOGNITION', 'ALERT', 'MENTION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "SelfAppraisalStatus" AS ENUM ('DRAFT', 'SUBMITTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "SelfAppraisalEvidenceType" AS ENUM ('UPLOAD', 'LINK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "ManagerReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "ManagerReviewRecommendation" AS ENUM ('NO_ACTION', 'PROMOTION', 'SALARY_INCREASE', 'TRAINING', 'PIP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PerformanceActionType" AS ENUM ('FEEDBACK', 'COACHING', 'PIP', 'REVIEW', 'ONE_ON_ONE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PerformanceActionPriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PerformanceActionStatus" AS ENUM ('DRAFT', 'ASSIGNED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AppraisalEscalationCategory" AS ENUM ('OVERDUE_APPRAISAL', 'PERFORMANCE_DISPUTE', 'POLICY_VIOLATION', 'SYSTEM_EXCEPTION', 'PIP_ESCALATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "EscalationSeverity" AS ENUM ('MEDIUM', 'HIGH', 'LOW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AppraisalEscalationStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "OpsNoteType" AS ENUM ('COMMENT', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AppraisalBulkAction" AS ENUM ('MASS_REMINDER', 'EXTEND_DUE_DATE', 'REASSIGN_REVIEWER', 'EXPORT_SUMMARY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PolicyExceptionStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "OverallRating" AS ENUM ('UNSATISFACTORY', 'NEEDS_IMPROVEMENT', 'MEETS_EXPECTATIONS', 'EXCEEDS_EXPECTATIONS', 'OUTSTANDING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "CalibrationStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'ADJUSTED', 'APPROVED', 'ESCALATED', 'FINALIZED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "CalibrationAdjustmentReason" AS ENUM ('INFLATION_CORRECTION', 'DEFLATION_CORRECTION', 'DEPARTMENT_NORMALIZATION', 'PEER_ALIGNMENT', 'PROMOTION_REVIEW', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PotentialLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "CalibrationSessionStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "FeedbackCategory" AS ENUM ('RECOGNITION', 'COACHING', 'PERFORMANCE', 'COLLABORATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "FeedbackSentiment" AS ENUM ('POSITIVE', 'CONSTRUCTIVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "RecognitionCategory" AS ENUM ('PERFORMANCE', 'LEADERSHIP', 'COLLABORATION', 'INNOVATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "RecognitionVisibility" AS ENUM ('COMPANY', 'TEAM', 'PRIVATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "FeedbackRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'DECLINED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "FeedbackReportStatus" AS ENUM ('OPEN', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "RecognitionReactionType" AS ENUM ('LIKE', 'CELEBRATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "DevelopmentPlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "DevelopmentActivityType" AS ENUM ('COURSE', 'COACHING', 'CERTIFICATION', 'PROJECT', 'READING', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "DevelopmentActivityStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "CoachingRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "CoachingFrequency" AS ENUM ('WEEKLY', 'BI_WEEKLY', 'MONTHLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PipStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ESCALATED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PipOutcome" AS ENUM ('SUCCESSFUL', 'UNSUCCESSFUL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PipIssueCategory" AS ENUM ('PRODUCTIVITY_OUTPUT', 'BEHAVIOR_CONDUCT', 'SKILL_GAP', 'ATTENDANCE_POLICY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PipMilestoneStatus" AS ENUM ('PENDING', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PipSessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PipActionItemStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PipKpiSnapshotKind" AS ENUM ('BASELINE', 'CHECKPOINT', 'FINAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PipSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PipSupportType" AS ENUM ('COACHING_SESSION', 'TECHNICAL_MENTORSHIP', 'TRAINING_MATERIALS', 'HR_CONSULTATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PipSupportStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DECLINED', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PipSupportSchedule" AS ENUM ('THIS_WEEK', 'NEXT_WEEK', 'WITHIN_TWO_WEEKS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PromotionReadiness" AS ENUM ('READY', 'HIGH_POTENTIAL', 'UNDER_OBSERVATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "CareerActionType" AS ENUM ('LEADERSHIP_PROGRAM', 'TECHNICAL_TRAINING', 'MENTORSHIP', 'STRETCH_ASSIGNMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "CriticalRoleStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "SuccessionReadiness" AS ENUM ('READY_NOW', 'READY_1_2_YEARS', 'READY_3_5_YEARS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "ComparisonReportType" AS ENUM ('DEPARTMENT_BENCHMARK', 'PEER_COMPARISON', 'EMPLOYEE_PROFILE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "ComparisonReportStatus" AS ENUM ('DRAFT', 'GENERATED', 'SHARED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AuditRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AuditEventStatus" AS ENUM ('VERIFIED', 'APPROVED', 'PENDING_REVIEW', 'WARNING', 'COMPLIANCE_ISSUE', 'ESCALATED', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AuditEntityType" AS ENUM ('CALIBRATION', 'REVIEW', 'PROMOTION', 'COMPETENCY', 'GOAL', 'TEMPLATE', 'APPRAISAL_CYCLE', 'PIP', 'FEEDBACK', 'RULE', 'FAIRNESS', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AuditCaseStatus" AS ENUM ('REVIEWING', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AuditCaseVerdict" AS ENUM ('PENDING_VERIFICATION', 'VIOLATION_CONFIRMED', 'CLEARED_FALSE_ALARM', 'REQUIRES_HR_ESCALATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AuditAnomalyStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'DISMISSED', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AuditExportKind" AS ENUM ('COMPLIANCE_REPORT', 'AUDIT_PACKAGE', 'RECORD_EVIDENCE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AuditExportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'SCHEDULED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "CriticalRoleTier" AS ENUM ('EXECUTIVE', 'DIRECTOR', 'MANAGER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "SuccessionReportType" AS ENUM ('SUCCESSION_REPORT', 'BOARD_PACK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "SuccessionReportStatus" AS ENUM ('GENERATED', 'SHARED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "IntelligenceReportType" AS ENUM ('EXECUTIVE', 'BOARD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "IntelligenceReportFormat" AS ENUM ('PDF', 'PPTX', 'XLSX');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "IntelligenceReportStatus" AS ENUM ('GENERATING', 'READY', 'FAILED', 'PURGED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AutomationRuleCategory" AS ENUM ('APPRAISAL', 'GOALS', 'COMPETENCIES', 'PIP', 'PROMOTION', 'DEVELOPMENT_PLAN', 'NOTIFICATIONS', 'COMPLIANCE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AutomationRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AutomationTrigger" AS ENUM ('GOAL_CREATED', 'GOAL_UPDATED', 'APPRAISAL_SUBMITTED', 'REVIEW_COMPLETED', 'RATING_FINALIZED', 'PIP_ACTIVATED', 'CYCLE_CREATED', 'REVIEW_OVERDUE', 'DEADLINE_REACHED', 'KPI_MISSED', 'KPI_THRESHOLD_HIT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AutomationAction" AS ENUM ('SEND_REMINDER', 'ASSIGN_MANAGER', 'CREATE_PIP', 'ESCALATE_APPROVAL', 'NOTIFY_HR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AutomationGovernanceType" AS ENUM ('ESCALATION', 'APPROVAL', 'AUDIT', 'POLICY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AutomationRunMode" AS ENUM ('TEST', 'LIVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AutomationRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AutomationChannel" AS ENUM ('EMAIL_APP', 'EMAIL', 'APP', 'SMS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AutomationTiming" AS ENUM ('IMMEDIATE', 'DAILY', 'WEEKLY', 'T_MINUS_3_DAYS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AutomationAudience" AS ENUM ('ALL_EMPLOYEES', 'REVIEWING_MANAGERS', 'PIP_PARTICIPANTS', 'HR_ADMINS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AutomationEntityType" AS ENUM ('RULE', 'NOTIFICATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "FairnessSignalCategory" AS ENUM ('BIAS', 'FRAUD', 'GOVERNANCE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "FairnessSeverity" AS ENUM ('MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "FairnessSignalStatus" AS ENUM ('OPEN', 'UNDER_INVESTIGATION', 'DISMISSED', 'CLEARED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "FairnessRiskCategory" AS ENUM ('RATING_INFLATION', 'PROMOTION_BIAS', 'SUCCESSION_EXCLUSION', 'SUPPRESSION', 'POLICY_VIOLATION', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "FairnessCaseStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'ESCALATED', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "FairnessCaseSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "FairnessCaseOutcome" AS ENUM ('SUBSTANTIATED', 'PARTIALLY_SUBSTANTIATED', 'NOT_SUBSTANTIATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "FairnessReportType" AS ENUM ('INVESTIGATION_REPORT', 'GOVERNANCE_PACK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "FairnessReportStatus" AS ENUM ('GENERATED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "candidate_accounts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "headline" TEXT,
    "locationState" TEXT,
    "locationLga" TEXT,
    "linkedInUrl" TEXT,
    "portfolioUrl" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "candidate_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "candidate_experiences" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "employmentType" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "candidate_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "candidate_educations" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "fieldOfStudy" TEXT,
    "startYear" INTEGER,
    "endYear" INTEGER,
    "grade" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "candidate_educations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "candidate_account_documents" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "category" "AccountDocumentCategory" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "resumeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "candidate_account_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "candidate_account_document_blobs" (
    "documentId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    CONSTRAINT "candidate_account_document_blobs_pkey" PRIMARY KEY ("documentId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "saved_jobs" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "job_alert_preferences" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "location" TEXT,
    "remoteOnly" BOOLEAN NOT NULL DEFAULT false,
    "minSalary" DECIMAL(18,2),
    "frequency" "JobAlertFrequency" NOT NULL DEFAULT 'DAILY',
    "activatedFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRunAt" TIMESTAMP(3),
    "unsubscribeToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "job_alert_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "job_alert_deliveries" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_alert_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "candidate_otps" (
    "id" TEXT NOT NULL,
    "purpose" "CandidateOtpPurpose" NOT NULL,
    "email" TEXT NOT NULL,
    "accountId" TEXT,
    "scopeRef" TEXT,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "candidate_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "staff_career_histories" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "previousDesignationId" TEXT,
    "newDesignationId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "promotionRecId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_career_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Competency" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "CompetencyCategory" NOT NULL,
    "customCategory" TEXT,
    "tags" TEXT,
    "ownerId" TEXT NOT NULL,
    "status" "CompetencyStatus" NOT NULL DEFAULT 'DRAFT',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "scaleId" TEXT,
    "isLeadership" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastReviewedAt" TIMESTAMP(3),
    CONSTRAINT "Competency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CompetencyBenchmark" (
    "id" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "level" TEXT,
    "levelId" TEXT,
    "description" TEXT,
    "behaviors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompetencyBenchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CompetencyRoleMapping" (
    "id" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "designationId" TEXT NOT NULL,
    "requiredLevel" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompetencyRoleMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CompetencyDepartmentMapping" (
    "id" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "requiredLevel" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompetencyDepartmentMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CompetencyHistory" (
    "id" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetencyHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CompetencyReview" (
    "id" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "status" "CompetencyReviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "outcome" "CompetencyReviewOutcome",
    "notes" TEXT,
    "scheduledById" TEXT NOT NULL,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "dueSoonNotifiedAt" TIMESTAMP(3),
    "lastOverdueNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompetencyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CompetencyDuplicateDismissal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "competencyAId" TEXT NOT NULL,
    "competencyBId" TEXT NOT NULL,
    "dismissedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetencyDuplicateDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProficiencyScale" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProficiencyScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProficiencyLevel" (
    "id" TEXT NOT NULL,
    "scaleId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProficiencyLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReviewTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "TemplateType" NOT NULL,
    "customType" TEXT,
    "ownerId" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReviewTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "TemplateVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TemplateSection" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "weight" INTEGER,
    "displayOrder" INTEGER NOT NULL,
    CONSTRAINT "TemplateSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TemplateQuestion" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "questionType" "QuestionType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL,
    "competencyId" TEXT,
    "proficiencyScaleId" TEXT,
    "config" JSONB,
    "helpText" TEXT,
    "bankItemId" TEXT,
    CONSTRAINT "TemplateQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "QuestionBankItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "questionType" "QuestionType" NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "competencyId" TEXT,
    "proficiencyScaleId" TEXT,
    "config" JSONB,
    "helpText" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuestionBankItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "QuestionBankOption" (
    "id" TEXT NOT NULL,
    "bankItemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    CONSTRAINT "QuestionBankOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TemplateAudienceScope" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "audienceType" "AudienceType" NOT NULL,
    CONSTRAINT "TemplateAudienceScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TemplateAssignment" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "scopeType" "AssignmentScopeType" NOT NULL DEFAULT 'ALL_DEPARTMENTS',
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedBy" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedBy" TEXT,
    "unassignedAt" TIMESTAMP(3),
    "phaseType" "ReviewPhaseType",
    CONSTRAINT "TemplateAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TemplateAssignmentDepartmentScope" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    CONSTRAINT "TemplateAssignmentDepartmentScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TemplateAssignmentJobLevelScope" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "seniorityBand" "SeniorityBand",
    CONSTRAINT "TemplateAssignmentJobLevelScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TemplateHistory" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "companyId" TEXT,
    "versionId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TemplateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalCycle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AppraisalCycleType" NOT NULL,
    "customType" TEXT,
    "status" "AppraisalCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "activatedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "statusBeforeArchive" "AppraisalCycleStatus",
    "ownerId" TEXT NOT NULL,
    "scopeType" "AppraisalCycleScopeType" NOT NULL DEFAULT 'ALL_DEPARTMENTS',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "escalationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "escalationThresholdHours" INTEGER DEFAULT 48,
    "approvalRouting" "ApprovalRoutingType" NOT NULL DEFAULT 'MANAGER_SKIPLEVEL_HR',
    "minTenureMonths" INTEGER NOT NULL DEFAULT 0,
    "reminderLeadHours" INTEGER NOT NULL DEFAULT 72,
    "reminderRecipients" "AppraisalReminderRecipient"[] DEFAULT ARRAY['EMPLOYEE', 'DIRECT_MANAGER', 'DEPARTMENT_HEAD']::"AppraisalReminderRecipient"[],
    "requireHrSignoff" BOOLEAN NOT NULL DEFAULT true,
    "autoAdvanceApprovals" BOOLEAN NOT NULL DEFAULT false,
    "peersPerEmployee" INTEGER NOT NULL DEFAULT 2,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppraisalCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalCycleDepartmentScope" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    CONSTRAINT "AppraisalCycleDepartmentScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalCyclePhase" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "phaseType" "ReviewPhaseType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "deadline" TIMESTAMP(3),
    "displayOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppraisalCyclePhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalCycleHistory" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppraisalCycleHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalCycleParticipant" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "departmentId" TEXT,
    "locationId" TEXT,
    "managerId" TEXT,
    "designationId" TEXT,
    "seniorityBand" "SeniorityBand",
    "skipLevelManagerId" TEXT,
    "departmentHeadId" TEXT,
    "enrolledVia" "ParticipantEnrollment" NOT NULL DEFAULT 'ACTIVATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppraisalCycleParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalParticipantPhase" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "phaseType" "ReviewPhaseType" NOT NULL,
    "status" "ParticipantPhaseStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deadlineOverride" TIMESTAMP(3),
    "assignmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppraisalParticipantPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalWorkflowSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "approvalRouting" "ApprovalRoutingType" NOT NULL DEFAULT 'MANAGER_SKIPLEVEL_HR',
    "requireHrSignoff" BOOLEAN NOT NULL DEFAULT true,
    "autoAdvanceApprovals" BOOLEAN NOT NULL DEFAULT false,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderLeadHours" INTEGER NOT NULL DEFAULT 72,
    "escalationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "escalationThresholdHours" INTEGER NOT NULL DEFAULT 48,
    "reminderRecipients" "AppraisalReminderRecipient"[] DEFAULT ARRAY['EMPLOYEE', 'DIRECT_MANAGER', 'DEPARTMENT_HEAD']::"AppraisalReminderRecipient"[],
    "peersPerEmployee" INTEGER NOT NULL DEFAULT 2,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppraisalWorkflowSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalSettingsHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppraisalSettingsHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalPeerAssignment" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "reviewerStaffId" TEXT NOT NULL,
    "source" "PeerAssignmentSource" NOT NULL DEFAULT 'AUTO',
    "assignedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppraisalPeerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalCycleExclusion" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "reason" "ParticipantExclusionReason" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "excludedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppraisalCycleExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalAutomationLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppraisalAutomationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Goal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "departmentId" TEXT,
    "cycleId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "priority" "GoalPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "GoalStatus" NOT NULL DEFAULT 'ON_TRACK',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "kpiImpact" "KpiImpact" NOT NULL DEFAULT 'MEDIUM_IMPACT',
    "alignmentType" "GoalAlignmentType" NOT NULL DEFAULT 'DEPARTMENT_OBJECTIVE',
    "performanceCategory" "GoalPerformanceCategory",
    "level" "GoalLevel" NOT NULL DEFAULT 'INDIVIDUAL',
    "weight" INTEGER NOT NULL DEFAULT 0,
    "assignedToId" TEXT,
    "assignedById" TEXT,
    "orgObjectiveId" TEXT,
    "parentGoalId" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GoalMilestone" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "displayOrder" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoalMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GoalProgressUpdate" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL,
    "notes" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalProgressUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GoalEvidence" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "progressUpdateId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "data" BYTEA,
    "note" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GoalHistory" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GoalComment" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "type" "GoalCommentType" NOT NULL DEFAULT 'GENERAL',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrgObjective" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "departmentId" TEXT,
    "level" "GoalLevel" NOT NULL DEFAULT 'COMPANY',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT,
    "parentObjectiveId" TEXT,
    "cycleId" TEXT,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrgObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Kpi" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "impact" "KpiImpact" NOT NULL DEFAULT 'MEDIUM_IMPACT',
    "deadline" TIMESTAMP(3),
    "measurementMethod" "KpiMeasurementMethod" NOT NULL DEFAULT 'MANUAL',
    "automatedTracking" BOOLEAN NOT NULL DEFAULT false,
    "integrationSource" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GoalDependency" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "dependsOnGoalId" TEXT NOT NULL,
    "isBlocking" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GoalConflict" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "goalAId" TEXT NOT NULL,
    "goalBId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "capacityA" DOUBLE PRECISION NOT NULL,
    "capacityB" DOUBLE PRECISION NOT NULL,
    "deficit" DOUBLE PRECISION NOT NULL,
    "workloadAnalysisText" TEXT,
    "status" "GoalConflictStatus" NOT NULL DEFAULT 'OPEN',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoalConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GoalConflictResolution" (
    "id" TEXT NOT NULL,
    "conflictId" TEXT NOT NULL,
    "action" "GoalConflictResolutionAction" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "payload" JSONB,
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "isChosen" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalConflictResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GoalActivity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "goalId" TEXT,
    "departmentId" TEXT,
    "authorId" TEXT NOT NULL,
    "type" "GoalActivityType" NOT NULL DEFAULT 'UPDATE',
    "title" TEXT,
    "content" TEXT NOT NULL,
    "badgeLabel" TEXT,
    "actionLabel" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GoalAiAnalysis" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "goalId" TEXT,
    "departmentId" TEXT,
    "summary" TEXT NOT NULL,
    "riskFlags" JSONB,
    "recommendations" JSONB,
    "model" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "generatedBy" TEXT,
    CONSTRAINT "GoalAiAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StaffWorkloadCapacity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "weeklyCapacityHours" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffWorkloadCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SelfAppraisal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "templateVersionId" TEXT,
    "status" "SelfAppraisalStatus" NOT NULL DEFAULT 'DRAFT',
    "challenges" TEXT,
    "learnings" TEXT,
    "careerAspiration" TEXT,
    "careerSkills" TEXT,
    "careerSupport" TEXT,
    "declarationAgreed" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SelfAppraisal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SelfAppraisalGoalReflection" (
    "id" TEXT NOT NULL,
    "selfAppraisalId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "goalTitle" TEXT NOT NULL,
    "goalProgress" INTEGER NOT NULL,
    "goalStatus" "GoalStatus" NOT NULL,
    "reflection" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 3,
    "displayOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SelfAppraisalGoalReflection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SelfAppraisalCompetencyRating" (
    "id" TEXT NOT NULL,
    "selfAppraisalId" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "competencyName" TEXT NOT NULL,
    "competencyDescription" TEXT,
    "rating" INTEGER,
    "comment" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SelfAppraisalCompetencyRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SelfAppraisalEvidence" (
    "id" TEXT NOT NULL,
    "goalReflectionId" TEXT NOT NULL,
    "sourceType" "SelfAppraisalEvidenceType" NOT NULL DEFAULT 'UPLOAD',
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "data" BYTEA,
    "uploadedBy" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SelfAppraisalEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SelfAppraisalHistory" (
    "id" TEXT NOT NULL,
    "selfAppraisalId" TEXT NOT NULL,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SelfAppraisalHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ManagerReview" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "templateVersionId" TEXT,
    "status" "ManagerReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "finalComments" TEXT,
    "recommendation" "ManagerReviewRecommendation" NOT NULL DEFAULT 'NO_ACTION',
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "kpiScore" DOUBLE PRECISION,
    "competencyScore" DOUBLE PRECISION,
    "overallScore" DOUBLE PRECISION,
    "calibratedOverallScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManagerReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ManagerReviewCompetencyRating" (
    "id" TEXT NOT NULL,
    "managerReviewId" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "competencyName" TEXT NOT NULL,
    "competencyDescription" TEXT,
    "rating" INTEGER,
    "comment" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "calibrationNote" TEXT,
    "calibratedRating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManagerReviewCompetencyRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ManagerReviewHistory" (
    "id" TEXT NOT NULL,
    "managerReviewId" TEXT NOT NULL,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManagerReviewHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PerformanceAction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cycleId" TEXT,
    "staffRecordId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" "PerformanceActionType" NOT NULL,
    "priority" "PerformanceActionPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "PerformanceActionStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "dueDate" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PerformanceAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PerformanceActionAttachment" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "data" BYTEA,
    "uploadedBy" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerformanceActionAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PerformanceActionHistory" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerformanceActionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalEscalation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cycleId" TEXT,
    "departmentId" TEXT,
    "resolutionNote" TEXT,
    "category" "AppraisalEscalationCategory" NOT NULL,
    "severity" "EscalationSeverity" NOT NULL DEFAULT 'HIGH',
    "status" "AppraisalEscalationStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "assignedReviewerId" TEXT,
    "raisedBy" TEXT NOT NULL,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "pipId" TEXT,
    "pipOpenKey" TEXT,
    "reason" TEXT,
    "recommendedNextSteps" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppraisalEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalEscalationHistory" (
    "id" TEXT NOT NULL,
    "escalationId" TEXT NOT NULL,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppraisalEscalationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PerformanceOpsNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "departmentId" TEXT,
    "type" "OpsNoteType" NOT NULL DEFAULT 'COMMENT',
    "authorId" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerformanceOpsNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalBulkOperation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "action" "AppraisalBulkAction" NOT NULL,
    "departmentKeys" TEXT[],
    "message" TEXT,
    "params" JSONB,
    "affectedCount" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,
    "performedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppraisalBulkOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalPolicyException" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedDueDate" TIMESTAMP(3) NOT NULL,
    "status" "PolicyExceptionStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppraisalPolicyException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalPolicyExceptionParticipant" (
    "id" TEXT NOT NULL,
    "exceptionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    CONSTRAINT "AppraisalPolicyExceptionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CalibrationRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "originalRating" "OverallRating" NOT NULL,
    "proposedRating" "OverallRating" NOT NULL,
    "status" "CalibrationStatus" NOT NULL DEFAULT 'PENDING',
    "adjustmentReason" "CalibrationAdjustmentReason",
    "justification" TEXT,
    "potential" "PotentialLevel",
    "approvedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalibrationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CalibrationSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "departmentId" TEXT,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "startsAt" TIMESTAMP(3),
    "status" "CalibrationSessionStatus" NOT NULL DEFAULT 'UPCOMING',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalibrationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CalibrationSessionAttendee" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalibrationSessionAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CalibrationHistory" (
    "id" TEXT NOT NULL,
    "recordId" TEXT,
    "sessionId" TEXT,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalibrationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Feedback" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "requestId" TEXT,
    "category" "FeedbackCategory",
    "sentiment" "FeedbackSentiment",
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "acknowledgedAt" TIMESTAMP(3),
    "recognitionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FeedbackLike" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FeedbackBookmark" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FeedbackComment" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "message" TEXT,
    "emoji" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FeedbackReport" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT,
    "status" "FeedbackReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FeedbackRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "message" TEXT,
    "status" "FeedbackRequestStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "focusAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeedbackRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Recognition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "giverId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "departmentId" TEXT,
    "category" "RecognitionCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "coreValues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility" "RecognitionVisibility" NOT NULL DEFAULT 'COMPANY',
    "points" INTEGER NOT NULL DEFAULT 0,
    "attachmentName" TEXT,
    "attachmentUrl" TEXT,
    "attachmentMime" TEXT,
    "attachmentSize" INTEGER,
    "attachmentData" BYTEA,
    "goalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Recognition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FeedbackHistory" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT,
    "requestId" TEXT,
    "recognitionId" TEXT,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RecognitionReaction" (
    "id" TEXT NOT NULL,
    "recognitionId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "type" "RecognitionReactionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecognitionReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DevelopmentPlan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "competencyId" TEXT,
    "careerAlignment" TEXT,
    "mentorId" TEXT,
    "status" "DevelopmentPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DevelopmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DevelopmentMilestone" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DevelopmentMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DevelopmentPlanActivity" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "type" "DevelopmentActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "DevelopmentActivityStatus" NOT NULL DEFAULT 'PLANNED',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "trainingProgramId" TEXT,
    "certificationTypeId" TEXT,
    "coachingRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DevelopmentPlanActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DevelopmentPlanEvidence" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "data" BYTEA,
    "uploadedById" TEXT NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DevelopmentPlanEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DevelopmentCoachingRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "coachId" TEXT,
    "focusCompetencyId" TEXT,
    "frequency" "CoachingFrequency" NOT NULL DEFAULT 'BI_WEEKLY',
    "message" TEXT NOT NULL,
    "status" "CoachingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "responseNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DevelopmentCoachingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DevelopmentPlanHistory" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DevelopmentPlanHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Pip" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "managerId" TEXT,
    "createdById" TEXT NOT NULL,
    "cycleId" TEXT,
    "managerReviewId" TEXT,
    "performanceActionId" TEXT,
    "status" "PipStatus" NOT NULL DEFAULT 'DRAFT',
    "outcome" "PipOutcome",
    "openKey" TEXT,
    "categories" "PipIssueCategory"[],
    "objectives" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "issueSummary" TEXT,
    "originalTargetDate" TIMESTAMP(3),
    "closureNote" TEXT,
    "roleTitle" TEXT,
    "designationId" TEXT,
    "departmentId" TEXT,
    "departmentName" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "targetScore" INTEGER NOT NULL DEFAULT 75,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Pip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PipMilestone" (
    "id" TEXT NOT NULL,
    "pipId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "PipMilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "displayOrder" INTEGER NOT NULL,
    "removedAt" TIMESTAMP(3),
    "completionNote" TEXT,
    "improvementObjectiveId" TEXT,
    "employeeReflection" TEXT,
    "reflectionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PipMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PipHistory" (
    "id" TEXT NOT NULL,
    "pipId" TEXT NOT NULL,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PipHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PipCoachingSession" (
    "id" TEXT NOT NULL,
    "pipId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "objectives" TEXT NOT NULL,
    "notes" TEXT,
    "status" "PipSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "improvementObjectiveId" TEXT,
    "sharedWithEmployee" BOOLEAN NOT NULL DEFAULT false,
    "employeeReflection" TEXT,
    "reflectionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PipCoachingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PipActionItem" (
    "id" TEXT NOT NULL,
    "pipId" TEXT NOT NULL,
    "sessionId" TEXT,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isBlocker" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TIMESTAMP(3),
    "status" "PipActionItemStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PipActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PipKpiSnapshot" (
    "id" TEXT NOT NULL,
    "pipId" TEXT NOT NULL,
    "kind" "PipKpiSnapshotKind" NOT NULL,
    "kpiScore" DOUBLE PRECISION NOT NULL,
    "goalCount" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PipKpiSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalEscalationComment" (
    "id" TEXT NOT NULL,
    "escalationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppraisalEscalationComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppraisalEscalationAttachment" (
    "id" TEXT NOT NULL,
    "escalationId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "data" BYTEA,
    "uploadedBy" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppraisalEscalationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PipImprovementObjective" (
    "id" TEXT NOT NULL,
    "pipId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "competency" TEXT,
    "kpi" TEXT,
    "baseline" TEXT,
    "target" TEXT,
    "severity" "PipSeverity" NOT NULL DEFAULT 'MEDIUM',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "removedAt" TIMESTAMP(3),
    "expectations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PipImprovementObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PipProgressUpdate" (
    "id" TEXT NOT NULL,
    "pipId" TEXT NOT NULL,
    "improvementObjectiveId" TEXT NOT NULL,
    "previousProgress" INTEGER NOT NULL,
    "progress" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PipProgressUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PipTraining" (
    "id" TEXT NOT NULL,
    "pipId" TEXT NOT NULL,
    "improvementObjectiveId" TEXT,
    "trainingProgramId" TEXT,
    "certificationTypeId" TEXT,
    "title" TEXT NOT NULL,
    "status" "PipMilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "assignedById" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PipTraining_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PipWeeklyCheckIn" (
    "id" TEXT NOT NULL,
    "pipId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "productivityScore" INTEGER NOT NULL,
    "qualityScore" INTEGER NOT NULL,
    "recoveryScore" INTEGER NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PipWeeklyCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PipSupportRequest" (
    "id" TEXT NOT NULL,
    "pipId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "type" "PipSupportType" NOT NULL DEFAULT 'COACHING_SESSION',
    "message" TEXT NOT NULL,
    "status" "PipSupportStatus" NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "preferredSchedule" "PipSupportSchedule" NOT NULL DEFAULT 'THIS_WEEK',
    "improvementObjectiveId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PipSupportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PipEvidence" (
    "id" TEXT NOT NULL,
    "pipId" TEXT NOT NULL,
    "improvementObjectiveId" TEXT NOT NULL,
    "progressUpdateId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "data" BYTEA,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PipEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PipProgressDraft" (
    "id" TEXT NOT NULL,
    "pipId" TEXT NOT NULL,
    "improvementObjectiveId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL,
    "note" TEXT,
    "completedTaskIds" TEXT[],
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PipProgressDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PromotionRecommendation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "cycleId" TEXT,
    "basisReviewId" TEXT,
    "status" "PromotionStatus" NOT NULL DEFAULT 'DRAFT',
    "openKey" TEXT,
    "currentDesignationId" TEXT,
    "currentRoleTitle" TEXT,
    "departmentId" TEXT,
    "departmentName" TEXT,
    "targetDesignationId" TEXT NOT NULL,
    "targetRoleTitle" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "justification" TEXT,
    "projectedSalaryChange" DECIMAL(18,2),
    "overallScore" DOUBLE PRECISION,
    "kpiScore" DOUBLE PRECISION,
    "leadershipScore" DOUBLE PRECISION,
    "potential" "PotentialLevel",
    "readiness" "PromotionReadiness",
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PromotionRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PromotionAttachment" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "data" BYTEA,
    "uploadedBy" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromotionAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PromotionHistory" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromotionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CareerDevelopmentAssignment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "actionType" "CareerActionType" NOT NULL,
    "followUpDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CareerDevelopmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CriticalRole" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "designationId" TEXT NOT NULL,
    "status" "CriticalRoleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "tier" "CriticalRoleTier",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CriticalRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SuccessionCandidate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "criticalRoleId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "nominatedById" TEXT NOT NULL,
    "readiness" "SuccessionReadiness" NOT NULL,
    "developmentActions" TEXT,
    "activeKey" TEXT,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SuccessionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SuccessionHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "criticalRoleId" TEXT NOT NULL,
    "candidateId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SuccessionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ComparisonReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "type" "ComparisonReportType" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ComparisonReportStatus" NOT NULL DEFAULT 'GENERATED',
    "config" JSONB NOT NULL,
    "snapshot" JSONB,
    "generatedAt" TIMESTAMP(3),
    "sharedAt" TIMESTAMP(3),
    "sharedNote" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComparisonReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ComparisonReportHistory" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComparisonReportHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "performance_audit_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "eventRef" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timezone" TEXT,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT,
    "actorDept" TEXT,
    "actorRef" TEXT,
    "action" TEXT NOT NULL,
    "entityType" "AuditEntityType" NOT NULL DEFAULT 'OTHER',
    "entityId" TEXT,
    "status" "AuditEventStatus" NOT NULL DEFAULT 'VERIFIED',
    "risk" "AuditRiskLevel" NOT NULL DEFAULT 'LOW',
    "sourceSystem" TEXT,
    "ipAddress" TEXT,
    "beforeValue" TEXT,
    "afterValue" TEXT,
    "reason" TEXT,
    "relatedObjects" JSONB,
    "approvalChain" JSONB,
    "validationResult" TEXT,
    "auditNote" TEXT,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "prevHash" TEXT,
    "hash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "performance_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "audit_investigation_cases" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "caseRef" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" "AuditCaseStatus" NOT NULL DEFAULT 'REVIEWING',
    "risk" "AuditRiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "verdict" "AuditCaseVerdict" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "findings" TEXT,
    "assignedToId" TEXT,
    "openedById" TEXT,
    "relatedEventId" TEXT,
    "anomalyId" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "audit_investigation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "audit_investigation_case_notes" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorId" TEXT,
    "action" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_investigation_case_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "audit_anomalies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "anomalyRef" TEXT NOT NULL,
    "ruleKey" TEXT,
    "severity" "AuditRiskLevel" NOT NULL DEFAULT 'HIGH',
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "affectedUserId" TEXT,
    "affectedRecord" TEXT,
    "recommendation" TEXT,
    "status" "AuditAnomalyStatus" NOT NULL DEFAULT 'OPEN',
    "sourceEventId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "audit_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "audit_export_jobs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "AuditExportKind" NOT NULL,
    "status" "AuditExportStatus" NOT NULL DEFAULT 'QUEUED',
    "format" TEXT,
    "dateRange" TEXT,
    "rangeFrom" TIMESTAMP(3),
    "rangeTo" TIMESTAMP(3),
    "filters" JSONB,
    "includedItems" JSONB,
    "eventId" TEXT,
    "recipientEmail" TEXT,
    "isScheduled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleCron" TEXT,
    "fileUrl" TEXT,
    "requestedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "audit_export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "audit_compliance_snapshots" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "policyAdherencePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "auditReadinessPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "documentationPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "complianceHealthPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalEvents" INTEGER NOT NULL DEFAULT 0,
    "overdueReviews" INTEGER NOT NULL DEFAULT 0,
    "policyViolations" INTEGER NOT NULL DEFAULT 0,
    "unauthorizedMods" INTEGER NOT NULL DEFAULT 0,
    "openCases" INTEGER NOT NULL DEFAULT 0,
    "deptRisk" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_compliance_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SuccessionMetricSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "capturedOn" TIMESTAMP(3) NOT NULL,
    "basisCycleId" TEXT,
    "criticalRoles" INTEGER NOT NULL,
    "readyRoles" INTEGER NOT NULL,
    "coveredRoles" INTEGER NOT NULL,
    "vacantRoles" INTEGER NOT NULL,
    "singleIncumbentRoles" INTEGER NOT NULL,
    "successors" INTEGER NOT NULL,
    "poolSize" INTEGER NOT NULL,
    "readyCount" INTEGER NOT NULL,
    "highPotentialCount" INTEGER NOT NULL,
    "observationCount" INTEGER NOT NULL,
    "hipoCount" INTEGER NOT NULL,
    "emergingCount" INTEGER NOT NULL,
    "pendingRequests" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SuccessionMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SuccessionReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" "SuccessionReportType" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "SuccessionReportStatus" NOT NULL DEFAULT 'GENERATED',
    "config" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sharedWithIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sharedAt" TIMESTAMP(3),
    "sharedNote" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SuccessionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SuccessionReportHistory" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SuccessionReportHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IntelligenceSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "strategicTargetScore" INTEGER NOT NULL DEFAULT 80,
    "minGroupSize" INTEGER NOT NULL DEFAULT 3,
    "leadershipWeights" JSONB,
    "reportRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "updatedById" TEXT,
    "chronicLowCycles" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntelligenceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IntelligenceSettingsHistory" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntelligenceSettingsHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IntelligenceReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "IntelligenceReportType" NOT NULL,
    "format" "IntelligenceReportFormat" NOT NULL DEFAULT 'PDF',
    "title" TEXT NOT NULL,
    "cycleId" TEXT,
    "cycleIds" TEXT[],
    "rangeKey" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "departmentIds" TEXT[],
    "sections" TEXT[],
    "status" "IntelligenceReportStatus" NOT NULL DEFAULT 'GENERATING',
    "error" TEXT,
    "snapshot" JSONB,
    "storagePath" TEXT,
    "fileName" TEXT,
    "sizeBytes" INTEGER,
    "generatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntelligenceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IntelligenceReportShare" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxDownloads" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntelligenceReportShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IntelligenceReportEvent" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "shareId" TEXT,
    "companyId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntelligenceReportEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AutomationRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "AutomationRuleCategory" NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "action" "AutomationAction" NOT NULL,
    "governanceType" "AutomationGovernanceType",
    "conditions" JSONB,
    "status" "AutomationRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "removedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AutomationRuleRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "mode" "AutomationRunMode" NOT NULL,
    "status" "AutomationRunStatus" NOT NULL,
    "triggeredById" TEXT,
    "targetStaffRecordId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "conditionsMet" BOOLEAN,
    "result" JSONB,
    "errorMessage" TEXT,
    "dedupeKey" TEXT,
    "eventId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "AutomationRuleRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AutomationNotification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "AutomationChannel" NOT NULL DEFAULT 'EMAIL_APP',
    "timing" "AutomationTiming" NOT NULL DEFAULT 'IMMEDIATE',
    "audience" "AutomationAudience" NOT NULL DEFAULT 'ALL_EMPLOYEES',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "removedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutomationNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AutomationHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" "AutomationEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AutomationEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "eventKey" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "subjectStaffRecordId" TEXT,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    CONSTRAINT "AutomationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AutomationExecutorTick" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "eventsEmitted" INTEGER NOT NULL DEFAULT 0,
    "eventsProcessed" INTEGER NOT NULL DEFAULT 0,
    "runsCreated" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    CONSTRAINT "AutomationExecutorTick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FairnessSignal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "signalKey" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "category" "FairnessSignalCategory" NOT NULL,
    "severity" "FairnessSeverity" NOT NULL,
    "status" "FairnessSignalStatus" NOT NULL DEFAULT 'OPEN',
    "managerId" TEXT,
    "departmentId" TEXT,
    "subjectRef" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "affectedCount" INTEGER NOT NULL DEFAULT 0,
    "evidence" JSONB NOT NULL,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL,
    "clearedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "dismissedByUserId" TEXT,
    "dismissedByName" TEXT,
    "dismissalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FairnessSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FairnessSignalHistory" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FairnessSignalHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FairnessDetectionRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL,
    "trigger" TEXT NOT NULL,
    "reviewsScanned" INTEGER NOT NULL DEFAULT 0,
    "signalsOpen" INTEGER NOT NULL DEFAULT 0,
    "signalsNew" INTEGER NOT NULL DEFAULT 0,
    "signalsCleared" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "FairnessDetectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FairnessMetricSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "capturedOn" TIMESTAMP(3) NOT NULL,
    "basisCycleId" TEXT,
    "reviewedCount" INTEGER NOT NULL,
    "integrityScore" DOUBLE PRECISION,
    "biasAlerts" INTEGER NOT NULL,
    "fraudIndicators" INTEGER NOT NULL,
    "governanceSignals" INTEGER NOT NULL,
    "auditFlags" INTEGER NOT NULL,
    "highSeveritySignals" INTEGER NOT NULL,
    "atRiskManagers" INTEGER NOT NULL,
    "openCases" INTEGER NOT NULL DEFAULT 0,
    "appraisalFairness" DOUBLE PRECISION,
    "promotionFairness" DOUBLE PRECISION,
    "successionObjectivity" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FairnessMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FairnessCase" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "caseNumber" INTEGER NOT NULL,
    "riskCategory" "FairnessRiskCategory" NOT NULL,
    "severity" "FairnessCaseSeverity" NOT NULL,
    "status" "FairnessCaseStatus" NOT NULL DEFAULT 'OPEN',
    "openKey" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "cycleId" TEXT,
    "managerId" TEXT,
    "managerName" TEXT,
    "departmentId" TEXT,
    "departmentName" TEXT,
    "assignedToId" TEXT,
    "startedAt" TIMESTAMP(3),
    "escalatedToId" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "escalationNote" TEXT,
    "outcome" "FairnessCaseOutcome",
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolvedByName" TEXT,
    "openedByUserId" TEXT NOT NULL,
    "openedByName" TEXT NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FairnessCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FairnessCaseSignal" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "activeKey" TEXT,
    "linkedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FairnessCaseSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FairnessCaseNote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FairnessCaseNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FairnessCaseHistory" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FairnessCaseHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FairnessReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "type" "FairnessReportType" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "FairnessReportStatus" NOT NULL DEFAULT 'GENERATED',
    "config" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FairnessReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FairnessReportHistory" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FairnessReportHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "candidate_accounts_email_key" ON "candidate_accounts"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "candidate_experiences_accountId_startDate_idx" ON "candidate_experiences"("accountId", "startDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "candidate_educations_accountId_idx" ON "candidate_educations"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "candidate_account_documents_resumeKey_key" ON "candidate_account_documents"("resumeKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "candidate_account_documents_accountId_category_idx" ON "candidate_account_documents"("accountId", "category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "saved_jobs_jobId_idx" ON "saved_jobs"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "saved_jobs_accountId_jobId_key" ON "saved_jobs"("accountId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "job_alert_preferences_accountId_key" ON "job_alert_preferences"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "job_alert_preferences_unsubscribeToken_key" ON "job_alert_preferences"("unsubscribeToken");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "job_alert_deliveries_jobId_idx" ON "job_alert_deliveries"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "job_alert_deliveries_accountId_jobId_key" ON "job_alert_deliveries"("accountId", "jobId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "candidate_otps_email_purpose_createdAt_idx" ON "candidate_otps"("email", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "candidate_otps_codeHash_idx" ON "candidate_otps"("codeHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "candidate_otps_expiresAt_idx" ON "candidate_otps"("expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_career_histories_companyId_staffId_effectiveDate_idx" ON "staff_career_histories"("companyId", "staffId", "effectiveDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_career_histories_previousDesignationId_idx" ON "staff_career_histories"("previousDesignationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_career_histories_newDesignationId_idx" ON "staff_career_histories"("newDesignationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Competency_companyId_idx" ON "Competency"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Competency_companyId_status_idx" ON "Competency"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Competency_companyId_category_idx" ON "Competency"("companyId", "category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Competency_ownerId_idx" ON "Competency"("ownerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Competency_scaleId_idx" ON "Competency"("scaleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetencyBenchmark_competencyId_idx" ON "CompetencyBenchmark"("competencyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetencyBenchmark_levelId_idx" ON "CompetencyBenchmark"("levelId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetencyRoleMapping_designationId_idx" ON "CompetencyRoleMapping"("designationId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CompetencyRoleMapping_competencyId_designationId_key" ON "CompetencyRoleMapping"("competencyId", "designationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetencyDepartmentMapping_departmentId_idx" ON "CompetencyDepartmentMapping"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CompetencyDepartmentMapping_competencyId_departmentId_key" ON "CompetencyDepartmentMapping"("competencyId", "departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetencyHistory_competencyId_idx" ON "CompetencyHistory"("competencyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetencyHistory_actorId_idx" ON "CompetencyHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetencyHistory_createdAt_idx" ON "CompetencyHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetencyHistory_companyId_createdAt_idx" ON "CompetencyHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetencyHistory_competencyId_createdAt_idx" ON "CompetencyHistory"("competencyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetencyReview_competencyId_idx" ON "CompetencyReview"("competencyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetencyReview_companyId_status_scheduledFor_idx" ON "CompetencyReview"("companyId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetencyReview_assigneeId_idx" ON "CompetencyReview"("assigneeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetencyDuplicateDismissal_companyId_idx" ON "CompetencyDuplicateDismissal"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CompetencyDuplicateDismissal_competencyAId_competencyBId_key" ON "CompetencyDuplicateDismissal"("competencyAId", "competencyBId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProficiencyScale_companyId_idx" ON "ProficiencyScale"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProficiencyScale_companyId_isDefault_idx" ON "ProficiencyScale"("companyId", "isDefault");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProficiencyLevel_scaleId_idx" ON "ProficiencyLevel"("scaleId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProficiencyLevel_scaleId_level_key" ON "ProficiencyLevel"("scaleId", "level");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewTemplate_currentVersionId_key" ON "ReviewTemplate"("currentVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReviewTemplate_companyId_idx" ON "ReviewTemplate"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReviewTemplate_companyId_type_idx" ON "ReviewTemplate"("companyId", "type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReviewTemplate_ownerId_idx" ON "ReviewTemplate"("ownerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReviewTemplateVersion_status_idx" ON "ReviewTemplateVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewTemplateVersion_templateId_versionNumber_key" ON "ReviewTemplateVersion"("templateId", "versionNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TemplateSection_versionId_idx" ON "TemplateSection"("versionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TemplateQuestion_sectionId_idx" ON "TemplateQuestion"("sectionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TemplateQuestion_competencyId_idx" ON "TemplateQuestion"("competencyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QuestionOption_questionId_idx" ON "QuestionOption"("questionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QuestionBankItem_companyId_idx" ON "QuestionBankItem"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QuestionBankItem_companyId_questionType_idx" ON "QuestionBankItem"("companyId", "questionType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QuestionBankItem_companyId_category_idx" ON "QuestionBankItem"("companyId", "category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QuestionBankOption_bankItemId_idx" ON "QuestionBankOption"("bankItemId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TemplateAudienceScope_versionId_audienceType_key" ON "TemplateAudienceScope"("versionId", "audienceType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TemplateAssignment_cycleId_idx" ON "TemplateAssignment"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TemplateAssignment_templateId_idx" ON "TemplateAssignment"("templateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TemplateAssignment_templateId_status_idx" ON "TemplateAssignment"("templateId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TemplateAssignment_cycleId_phaseType_status_idx" ON "TemplateAssignment"("cycleId", "phaseType", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TemplateAssignmentDepartmentScope_departmentId_idx" ON "TemplateAssignmentDepartmentScope"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TemplateAssignmentDepartmentScope_assignmentId_departmentId_key" ON "TemplateAssignmentDepartmentScope"("assignmentId", "departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TemplateAssignmentJobLevelScope_assignmentId_idx" ON "TemplateAssignmentJobLevelScope"("assignmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TemplateAssignmentJobLevelScope_seniorityBand_idx" ON "TemplateAssignmentJobLevelScope"("seniorityBand");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TemplateAssignmentJobLevelScope_assignmentId_seniorityBand_key" ON "TemplateAssignmentJobLevelScope"("assignmentId", "seniorityBand");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TemplateHistory_templateId_idx" ON "TemplateHistory"("templateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TemplateHistory_actorId_idx" ON "TemplateHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TemplateHistory_createdAt_idx" ON "TemplateHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TemplateHistory_companyId_createdAt_idx" ON "TemplateHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycle_companyId_idx" ON "AppraisalCycle"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycle_companyId_status_idx" ON "AppraisalCycle"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycle_companyId_type_idx" ON "AppraisalCycle"("companyId", "type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycle_ownerId_idx" ON "AppraisalCycle"("ownerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycleDepartmentScope_departmentId_idx" ON "AppraisalCycleDepartmentScope"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AppraisalCycleDepartmentScope_cycleId_departmentId_key" ON "AppraisalCycleDepartmentScope"("cycleId", "departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCyclePhase_cycleId_idx" ON "AppraisalCyclePhase"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AppraisalCyclePhase_cycleId_phaseType_key" ON "AppraisalCyclePhase"("cycleId", "phaseType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycleHistory_cycleId_idx" ON "AppraisalCycleHistory"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycleHistory_actorId_idx" ON "AppraisalCycleHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycleHistory_createdAt_idx" ON "AppraisalCycleHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycleHistory_companyId_createdAt_idx" ON "AppraisalCycleHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycleParticipant_cycleId_idx" ON "AppraisalCycleParticipant"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycleParticipant_cycleId_departmentId_idx" ON "AppraisalCycleParticipant"("cycleId", "departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycleParticipant_cycleId_locationId_idx" ON "AppraisalCycleParticipant"("cycleId", "locationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycleParticipant_designationId_idx" ON "AppraisalCycleParticipant"("designationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycleParticipant_companyId_idx" ON "AppraisalCycleParticipant"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycleParticipant_staffRecordId_idx" ON "AppraisalCycleParticipant"("staffRecordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycleParticipant_cycleId_managerId_idx" ON "AppraisalCycleParticipant"("cycleId", "managerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycleParticipant_departmentHeadId_idx" ON "AppraisalCycleParticipant"("departmentHeadId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AppraisalCycleParticipant_cycleId_staffRecordId_key" ON "AppraisalCycleParticipant"("cycleId", "staffRecordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalParticipantPhase_cycleId_phaseType_status_idx" ON "AppraisalParticipantPhase"("cycleId", "phaseType", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalParticipantPhase_participantId_idx" ON "AppraisalParticipantPhase"("participantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalParticipantPhase_assignmentId_idx" ON "AppraisalParticipantPhase"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AppraisalParticipantPhase_participantId_phaseType_key" ON "AppraisalParticipantPhase"("participantId", "phaseType");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AppraisalWorkflowSettings_companyId_key" ON "AppraisalWorkflowSettings"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalSettingsHistory_companyId_createdAt_idx" ON "AppraisalSettingsHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalSettingsHistory_actorId_idx" ON "AppraisalSettingsHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalPeerAssignment_cycleId_idx" ON "AppraisalPeerAssignment"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalPeerAssignment_reviewerStaffId_idx" ON "AppraisalPeerAssignment"("reviewerStaffId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AppraisalPeerAssignment_participantId_reviewerStaffId_key" ON "AppraisalPeerAssignment"("participantId", "reviewerStaffId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycleExclusion_cycleId_idx" ON "AppraisalCycleExclusion"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalCycleExclusion_companyId_idx" ON "AppraisalCycleExclusion"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AppraisalCycleExclusion_cycleId_staffRecordId_key" ON "AppraisalCycleExclusion"("cycleId", "staffRecordId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AppraisalAutomationLog_dedupeKey_key" ON "AppraisalAutomationLog"("dedupeKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalAutomationLog_cycleId_idx" ON "AppraisalAutomationLog"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalAutomationLog_companyId_createdAt_idx" ON "AppraisalAutomationLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Goal_companyId_idx" ON "Goal"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Goal_companyId_status_idx" ON "Goal"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Goal_companyId_isArchived_idx" ON "Goal"("companyId", "isArchived");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Goal_staffRecordId_idx" ON "Goal"("staffRecordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Goal_departmentId_idx" ON "Goal"("departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Goal_parentGoalId_idx" ON "Goal"("parentGoalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Goal_cycleId_idx" ON "Goal"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Goal_companyId_departmentId_level_idx" ON "Goal"("companyId", "departmentId", "level");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Goal_assignedToId_idx" ON "Goal"("assignedToId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Goal_assignedById_idx" ON "Goal"("assignedById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Goal_orgObjectiveId_idx" ON "Goal"("orgObjectiveId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Goal_companyId_completedAt_idx" ON "Goal"("companyId", "completedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalMilestone_goalId_idx" ON "GoalMilestone"("goalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalMilestone_goalId_dueDate_idx" ON "GoalMilestone"("goalId", "dueDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalProgressUpdate_goalId_idx" ON "GoalProgressUpdate"("goalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalProgressUpdate_actorId_idx" ON "GoalProgressUpdate"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalProgressUpdate_createdAt_idx" ON "GoalProgressUpdate"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalEvidence_goalId_idx" ON "GoalEvidence"("goalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalEvidence_progressUpdateId_idx" ON "GoalEvidence"("progressUpdateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalHistory_goalId_idx" ON "GoalHistory"("goalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalHistory_actorId_idx" ON "GoalHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalHistory_createdAt_idx" ON "GoalHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalHistory_companyId_createdAt_idx" ON "GoalHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalComment_goalId_idx" ON "GoalComment"("goalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalComment_authorId_idx" ON "GoalComment"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrgObjective_companyId_idx" ON "OrgObjective"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrgObjective_companyId_level_idx" ON "OrgObjective"("companyId", "level");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrgObjective_departmentId_idx" ON "OrgObjective"("departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrgObjective_parentObjectiveId_idx" ON "OrgObjective"("parentObjectiveId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrgObjective_cycleId_idx" ON "OrgObjective"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Kpi_companyId_idx" ON "Kpi"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Kpi_goalId_idx" ON "Kpi"("goalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Kpi_ownerId_idx" ON "Kpi"("ownerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Kpi_goalId_isArchived_idx" ON "Kpi"("goalId", "isArchived");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalDependency_goalId_idx" ON "GoalDependency"("goalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalDependency_dependsOnGoalId_idx" ON "GoalDependency"("dependsOnGoalId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GoalDependency_goalId_dependsOnGoalId_key" ON "GoalDependency"("goalId", "dependsOnGoalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalConflict_companyId_status_idx" ON "GoalConflict"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalConflict_goalAId_idx" ON "GoalConflict"("goalAId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalConflict_goalBId_idx" ON "GoalConflict"("goalBId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalConflict_assigneeId_idx" ON "GoalConflict"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GoalConflict_goalAId_goalBId_key" ON "GoalConflict"("goalAId", "goalBId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalConflictResolution_conflictId_idx" ON "GoalConflictResolution"("conflictId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalActivity_companyId_createdAt_idx" ON "GoalActivity"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalActivity_departmentId_createdAt_idx" ON "GoalActivity"("departmentId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalActivity_goalId_idx" ON "GoalActivity"("goalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalActivity_authorId_idx" ON "GoalActivity"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalAiAnalysis_companyId_idx" ON "GoalAiAnalysis"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalAiAnalysis_goalId_generatedAt_idx" ON "GoalAiAnalysis"("goalId", "generatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalAiAnalysis_departmentId_generatedAt_idx" ON "GoalAiAnalysis"("departmentId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StaffWorkloadCapacity_staffRecordId_key" ON "StaffWorkloadCapacity"("staffRecordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StaffWorkloadCapacity_companyId_idx" ON "StaffWorkloadCapacity"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SelfAppraisal_companyId_idx" ON "SelfAppraisal"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SelfAppraisal_cycleId_status_idx" ON "SelfAppraisal"("cycleId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SelfAppraisal_staffRecordId_idx" ON "SelfAppraisal"("staffRecordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SelfAppraisal_templateVersionId_idx" ON "SelfAppraisal"("templateVersionId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SelfAppraisal_participantId_key" ON "SelfAppraisal"("participantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SelfAppraisalGoalReflection_goalId_idx" ON "SelfAppraisalGoalReflection"("goalId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SelfAppraisalGoalReflection_selfAppraisalId_goalId_key" ON "SelfAppraisalGoalReflection"("selfAppraisalId", "goalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SelfAppraisalCompetencyRating_competencyId_idx" ON "SelfAppraisalCompetencyRating"("competencyId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SelfAppraisalCompetencyRating_selfAppraisalId_competencyId_key" ON "SelfAppraisalCompetencyRating"("selfAppraisalId", "competencyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SelfAppraisalEvidence_goalReflectionId_idx" ON "SelfAppraisalEvidence"("goalReflectionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SelfAppraisalEvidence_uploadedBy_idx" ON "SelfAppraisalEvidence"("uploadedBy");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SelfAppraisalHistory_selfAppraisalId_idx" ON "SelfAppraisalHistory"("selfAppraisalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SelfAppraisalHistory_actorId_idx" ON "SelfAppraisalHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SelfAppraisalHistory_createdAt_idx" ON "SelfAppraisalHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SelfAppraisalHistory_companyId_createdAt_idx" ON "SelfAppraisalHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ManagerReview_companyId_idx" ON "ManagerReview"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ManagerReview_cycleId_status_idx" ON "ManagerReview"("cycleId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ManagerReview_cycleId_reviewerId_idx" ON "ManagerReview"("cycleId", "reviewerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ManagerReview_cycleId_overallScore_idx" ON "ManagerReview"("cycleId", "overallScore");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ManagerReview_staffRecordId_idx" ON "ManagerReview"("staffRecordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ManagerReview_templateVersionId_idx" ON "ManagerReview"("templateVersionId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ManagerReview_participantId_key" ON "ManagerReview"("participantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ManagerReviewCompetencyRating_competencyId_idx" ON "ManagerReviewCompetencyRating"("competencyId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ManagerReviewCompetencyRating_managerReviewId_competencyId_key" ON "ManagerReviewCompetencyRating"("managerReviewId", "competencyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ManagerReviewHistory_managerReviewId_idx" ON "ManagerReviewHistory"("managerReviewId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ManagerReviewHistory_actorId_idx" ON "ManagerReviewHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ManagerReviewHistory_createdAt_idx" ON "ManagerReviewHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ManagerReviewHistory_companyId_createdAt_idx" ON "ManagerReviewHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceAction_companyId_status_idx" ON "PerformanceAction"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceAction_staffRecordId_idx" ON "PerformanceAction"("staffRecordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceAction_cycleId_idx" ON "PerformanceAction"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceAction_createdById_idx" ON "PerformanceAction"("createdById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceAction_dueDate_idx" ON "PerformanceAction"("dueDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceActionAttachment_actionId_idx" ON "PerformanceActionAttachment"("actionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceActionAttachment_uploadedBy_idx" ON "PerformanceActionAttachment"("uploadedBy");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceActionHistory_actionId_idx" ON "PerformanceActionHistory"("actionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceActionHistory_actorId_idx" ON "PerformanceActionHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceActionHistory_createdAt_idx" ON "PerformanceActionHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceActionHistory_companyId_createdAt_idx" ON "PerformanceActionHistory"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AppraisalEscalation_pipOpenKey_key" ON "AppraisalEscalation"("pipOpenKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalEscalation_companyId_status_idx" ON "AppraisalEscalation"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalEscalation_cycleId_departmentId_idx" ON "AppraisalEscalation"("cycleId", "departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalEscalation_assignedReviewerId_status_idx" ON "AppraisalEscalation"("assignedReviewerId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalEscalation_raisedBy_idx" ON "AppraisalEscalation"("raisedBy");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalEscalation_pipId_idx" ON "AppraisalEscalation"("pipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalEscalationHistory_escalationId_idx" ON "AppraisalEscalationHistory"("escalationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalEscalationHistory_actorId_idx" ON "AppraisalEscalationHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalEscalationHistory_createdAt_idx" ON "AppraisalEscalationHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalEscalationHistory_companyId_createdAt_idx" ON "AppraisalEscalationHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceOpsNote_cycleId_departmentId_createdAt_idx" ON "PerformanceOpsNote"("cycleId", "departmentId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceOpsNote_companyId_idx" ON "PerformanceOpsNote"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceOpsNote_authorId_idx" ON "PerformanceOpsNote"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalBulkOperation_companyId_createdAt_idx" ON "AppraisalBulkOperation"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalBulkOperation_cycleId_idx" ON "AppraisalBulkOperation"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalBulkOperation_performedBy_idx" ON "AppraisalBulkOperation"("performedBy");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalPolicyException_companyId_status_idx" ON "AppraisalPolicyException"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalPolicyException_cycleId_status_idx" ON "AppraisalPolicyException"("cycleId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalPolicyExceptionParticipant_participantId_idx" ON "AppraisalPolicyExceptionParticipant"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AppraisalPolicyExceptionParticipant_exceptionId_participant_key" ON "AppraisalPolicyExceptionParticipant"("exceptionId", "participantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalibrationRecord_companyId_cycleId_status_idx" ON "CalibrationRecord"("companyId", "cycleId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalibrationRecord_cycleId_proposedRating_idx" ON "CalibrationRecord"("cycleId", "proposedRating");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalibrationRecord_staffRecordId_idx" ON "CalibrationRecord"("staffRecordId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CalibrationRecord_participantId_key" ON "CalibrationRecord"("participantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalibrationSession_companyId_cycleId_status_idx" ON "CalibrationSession"("companyId", "cycleId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalibrationSession_departmentId_idx" ON "CalibrationSession"("departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalibrationSession_createdById_idx" ON "CalibrationSession"("createdById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalibrationSessionAttendee_staffRecordId_idx" ON "CalibrationSessionAttendee"("staffRecordId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CalibrationSessionAttendee_sessionId_staffRecordId_key" ON "CalibrationSessionAttendee"("sessionId", "staffRecordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalibrationHistory_recordId_idx" ON "CalibrationHistory"("recordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalibrationHistory_sessionId_idx" ON "CalibrationHistory"("sessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalibrationHistory_actorId_idx" ON "CalibrationHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalibrationHistory_createdAt_idx" ON "CalibrationHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalibrationHistory_companyId_createdAt_idx" ON "CalibrationHistory"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Feedback_requestId_key" ON "Feedback"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Feedback_recognitionId_key" ON "Feedback"("recognitionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Feedback_companyId_idx" ON "Feedback"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Feedback_recipientId_createdAt_idx" ON "Feedback"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Feedback_authorId_idx" ON "Feedback"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Feedback_companyId_category_idx" ON "Feedback"("companyId", "category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeedbackLike_staffRecordId_idx" ON "FeedbackLike"("staffRecordId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FeedbackLike_feedbackId_staffRecordId_key" ON "FeedbackLike"("feedbackId", "staffRecordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeedbackBookmark_staffRecordId_idx" ON "FeedbackBookmark"("staffRecordId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FeedbackBookmark_feedbackId_staffRecordId_key" ON "FeedbackBookmark"("feedbackId", "staffRecordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeedbackComment_feedbackId_createdAt_idx" ON "FeedbackComment"("feedbackId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeedbackComment_authorId_idx" ON "FeedbackComment"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeedbackReport_status_idx" ON "FeedbackReport"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FeedbackReport_feedbackId_reporterId_key" ON "FeedbackReport"("feedbackId", "reporterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeedbackRequest_companyId_status_idx" ON "FeedbackRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeedbackRequest_reviewerId_status_idx" ON "FeedbackRequest"("reviewerId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeedbackRequest_requesterId_idx" ON "FeedbackRequest"("requesterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Recognition_companyId_createdAt_idx" ON "Recognition"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Recognition_recipientId_createdAt_idx" ON "Recognition"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Recognition_giverId_createdAt_idx" ON "Recognition"("giverId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Recognition_companyId_visibility_departmentId_idx" ON "Recognition"("companyId", "visibility", "departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Recognition_goalId_idx" ON "Recognition"("goalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeedbackHistory_feedbackId_idx" ON "FeedbackHistory"("feedbackId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeedbackHistory_requestId_idx" ON "FeedbackHistory"("requestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeedbackHistory_recognitionId_idx" ON "FeedbackHistory"("recognitionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeedbackHistory_actorId_idx" ON "FeedbackHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeedbackHistory_companyId_createdAt_idx" ON "FeedbackHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecognitionReaction_staffRecordId_idx" ON "RecognitionReaction"("staffRecordId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RecognitionReaction_recognitionId_staffRecordId_type_key" ON "RecognitionReaction"("recognitionId", "staffRecordId", "type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentPlan_companyId_staffRecordId_status_idx" ON "DevelopmentPlan"("companyId", "staffRecordId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentPlan_companyId_status_targetDate_idx" ON "DevelopmentPlan"("companyId", "status", "targetDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentPlan_staffRecordId_idx" ON "DevelopmentPlan"("staffRecordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentPlan_competencyId_idx" ON "DevelopmentPlan"("competencyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentPlan_mentorId_idx" ON "DevelopmentPlan"("mentorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentMilestone_planId_displayOrder_idx" ON "DevelopmentMilestone"("planId", "displayOrder");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentMilestone_planId_isDone_idx" ON "DevelopmentMilestone"("planId", "isDone");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentMilestone_dueDate_idx" ON "DevelopmentMilestone"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DevelopmentPlanActivity_coachingRequestId_key" ON "DevelopmentPlanActivity"("coachingRequestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentPlanActivity_planId_idx" ON "DevelopmentPlanActivity"("planId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentPlanActivity_trainingProgramId_idx" ON "DevelopmentPlanActivity"("trainingProgramId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentPlanActivity_certificationTypeId_idx" ON "DevelopmentPlanActivity"("certificationTypeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentPlanEvidence_planId_idx" ON "DevelopmentPlanEvidence"("planId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentPlanEvidence_uploadedById_idx" ON "DevelopmentPlanEvidence"("uploadedById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentCoachingRequest_planId_idx" ON "DevelopmentCoachingRequest"("planId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentCoachingRequest_companyId_status_idx" ON "DevelopmentCoachingRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentCoachingRequest_coachId_status_idx" ON "DevelopmentCoachingRequest"("coachId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentCoachingRequest_requesterId_idx" ON "DevelopmentCoachingRequest"("requesterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentPlanHistory_planId_idx" ON "DevelopmentPlanHistory"("planId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentPlanHistory_actorId_idx" ON "DevelopmentPlanHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentPlanHistory_createdAt_idx" ON "DevelopmentPlanHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DevelopmentPlanHistory_companyId_createdAt_idx" ON "DevelopmentPlanHistory"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Pip_managerReviewId_key" ON "Pip"("managerReviewId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Pip_performanceActionId_key" ON "Pip"("performanceActionId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Pip_openKey_key" ON "Pip"("openKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Pip_companyId_status_idx" ON "Pip"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Pip_managerId_status_idx" ON "Pip"("managerId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Pip_staffRecordId_idx" ON "Pip"("staffRecordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Pip_cycleId_idx" ON "Pip"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Pip_targetDate_idx" ON "Pip"("targetDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Pip_companyId_closedAt_idx" ON "Pip"("companyId", "closedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Pip_companyId_departmentId_idx" ON "Pip"("companyId", "departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Pip_companyId_designationId_idx" ON "Pip"("companyId", "designationId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Pip_companyId_number_key" ON "Pip"("companyId", "number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipMilestone_pipId_status_idx" ON "PipMilestone"("pipId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipMilestone_dueDate_idx" ON "PipMilestone"("dueDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipMilestone_improvementObjectiveId_idx" ON "PipMilestone"("improvementObjectiveId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipHistory_pipId_idx" ON "PipHistory"("pipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipHistory_actorId_idx" ON "PipHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipHistory_createdAt_idx" ON "PipHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipHistory_companyId_createdAt_idx" ON "PipHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipCoachingSession_pipId_status_idx" ON "PipCoachingSession"("pipId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipCoachingSession_status_scheduledAt_idx" ON "PipCoachingSession"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipCoachingSession_createdById_idx" ON "PipCoachingSession"("createdById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipCoachingSession_improvementObjectiveId_idx" ON "PipCoachingSession"("improvementObjectiveId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipActionItem_pipId_status_idx" ON "PipActionItem"("pipId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipActionItem_sessionId_idx" ON "PipActionItem"("sessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipActionItem_createdById_idx" ON "PipActionItem"("createdById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipKpiSnapshot_pipId_capturedAt_idx" ON "PipKpiSnapshot"("pipId", "capturedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipKpiSnapshot_capturedAt_idx" ON "PipKpiSnapshot"("capturedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalEscalationComment_escalationId_createdAt_idx" ON "AppraisalEscalationComment"("escalationId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalEscalationComment_authorId_idx" ON "AppraisalEscalationComment"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalEscalationAttachment_escalationId_idx" ON "AppraisalEscalationAttachment"("escalationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppraisalEscalationAttachment_uploadedBy_idx" ON "AppraisalEscalationAttachment"("uploadedBy");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipImprovementObjective_pipId_idx" ON "PipImprovementObjective"("pipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipProgressUpdate_improvementObjectiveId_createdAt_idx" ON "PipProgressUpdate"("improvementObjectiveId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipProgressUpdate_pipId_createdAt_idx" ON "PipProgressUpdate"("pipId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipTraining_pipId_idx" ON "PipTraining"("pipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipTraining_improvementObjectiveId_idx" ON "PipTraining"("improvementObjectiveId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipTraining_trainingProgramId_idx" ON "PipTraining"("trainingProgramId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipTraining_certificationTypeId_idx" ON "PipTraining"("certificationTypeId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PipWeeklyCheckIn_pipId_weekStart_key" ON "PipWeeklyCheckIn"("pipId", "weekStart");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipSupportRequest_pipId_status_idx" ON "PipSupportRequest"("pipId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipSupportRequest_staffRecordId_idx" ON "PipSupportRequest"("staffRecordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipSupportRequest_improvementObjectiveId_idx" ON "PipSupportRequest"("improvementObjectiveId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipEvidence_pipId_idx" ON "PipEvidence"("pipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipEvidence_improvementObjectiveId_createdAt_idx" ON "PipEvidence"("improvementObjectiveId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipEvidence_progressUpdateId_idx" ON "PipEvidence"("progressUpdateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipEvidence_uploadedById_idx" ON "PipEvidence"("uploadedById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipProgressDraft_pipId_idx" ON "PipProgressDraft"("pipId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PipProgressDraft_improvementObjectiveId_staffRecordId_key" ON "PipProgressDraft"("improvementObjectiveId", "staffRecordId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PromotionRecommendation_openKey_key" ON "PromotionRecommendation"("openKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionRecommendation_companyId_status_idx" ON "PromotionRecommendation"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionRecommendation_staffRecordId_status_idx" ON "PromotionRecommendation"("staffRecordId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionRecommendation_createdById_idx" ON "PromotionRecommendation"("createdById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionRecommendation_cycleId_idx" ON "PromotionRecommendation"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionRecommendation_companyId_departmentId_idx" ON "PromotionRecommendation"("companyId", "departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionRecommendation_targetDesignationId_idx" ON "PromotionRecommendation"("targetDesignationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionRecommendation_companyId_decidedAt_idx" ON "PromotionRecommendation"("companyId", "decidedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionAttachment_recommendationId_idx" ON "PromotionAttachment"("recommendationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionAttachment_uploadedBy_idx" ON "PromotionAttachment"("uploadedBy");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionHistory_recommendationId_idx" ON "PromotionHistory"("recommendationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionHistory_actorId_idx" ON "PromotionHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionHistory_createdAt_idx" ON "PromotionHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionHistory_companyId_createdAt_idx" ON "PromotionHistory"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CareerDevelopmentAssignment_planId_key" ON "CareerDevelopmentAssignment"("planId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CareerDevelopmentAssignment_companyId_staffRecordId_idx" ON "CareerDevelopmentAssignment"("companyId", "staffRecordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CareerDevelopmentAssignment_assignedById_idx" ON "CareerDevelopmentAssignment"("assignedById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CriticalRole_companyId_status_idx" ON "CriticalRole"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CriticalRole_companyId_tier_idx" ON "CriticalRole"("companyId", "tier");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CriticalRole_companyId_designationId_key" ON "CriticalRole"("companyId", "designationId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SuccessionCandidate_activeKey_key" ON "SuccessionCandidate"("activeKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SuccessionCandidate_companyId_staffRecordId_idx" ON "SuccessionCandidate"("companyId", "staffRecordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SuccessionCandidate_criticalRoleId_readiness_idx" ON "SuccessionCandidate"("criticalRoleId", "readiness");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SuccessionCandidate_nominatedById_idx" ON "SuccessionCandidate"("nominatedById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SuccessionHistory_criticalRoleId_idx" ON "SuccessionHistory"("criticalRoleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SuccessionHistory_candidateId_idx" ON "SuccessionHistory"("candidateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SuccessionHistory_actorId_idx" ON "SuccessionHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SuccessionHistory_createdAt_idx" ON "SuccessionHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SuccessionHistory_companyId_createdAt_idx" ON "SuccessionHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ComparisonReport_companyId_status_idx" ON "ComparisonReport"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ComparisonReport_createdById_status_idx" ON "ComparisonReport"("createdById", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ComparisonReport_cycleId_idx" ON "ComparisonReport"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ComparisonReport_companyId_generatedAt_idx" ON "ComparisonReport"("companyId", "generatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ComparisonReportHistory_reportId_idx" ON "ComparisonReportHistory"("reportId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ComparisonReportHistory_actorId_idx" ON "ComparisonReportHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ComparisonReportHistory_createdAt_idx" ON "ComparisonReportHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ComparisonReportHistory_companyId_createdAt_idx" ON "ComparisonReportHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "performance_audit_events_companyId_occurredAt_idx" ON "performance_audit_events"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "performance_audit_events_companyId_entityType_entityId_idx" ON "performance_audit_events"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "performance_audit_events_companyId_risk_status_idx" ON "performance_audit_events"("companyId", "risk", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "performance_audit_events_companyId_actorId_idx" ON "performance_audit_events"("companyId", "actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "performance_audit_events_companyId_actorDept_idx" ON "performance_audit_events"("companyId", "actorDept");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "performance_audit_events_companyId_eventRef_key" ON "performance_audit_events"("companyId", "eventRef");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "audit_investigation_cases_anomalyId_key" ON "audit_investigation_cases"("anomalyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_investigation_cases_companyId_status_idx" ON "audit_investigation_cases"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_investigation_cases_companyId_assignedToId_idx" ON "audit_investigation_cases"("companyId", "assignedToId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_investigation_cases_relatedEventId_idx" ON "audit_investigation_cases"("relatedEventId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "audit_investigation_cases_companyId_caseRef_key" ON "audit_investigation_cases"("companyId", "caseRef");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_investigation_case_notes_caseId_createdAt_idx" ON "audit_investigation_case_notes"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_anomalies_companyId_status_severity_idx" ON "audit_anomalies"("companyId", "status", "severity");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_anomalies_companyId_detectedAt_idx" ON "audit_anomalies"("companyId", "detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "audit_anomalies_companyId_anomalyRef_key" ON "audit_anomalies"("companyId", "anomalyRef");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_export_jobs_companyId_kind_createdAt_idx" ON "audit_export_jobs"("companyId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_export_jobs_companyId_isScheduled_idx" ON "audit_export_jobs"("companyId", "isScheduled");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "audit_compliance_snapshots_companyId_snapshotDate_key" ON "audit_compliance_snapshots"("companyId", "snapshotDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SuccessionMetricSnapshot_companyId_capturedOn_idx" ON "SuccessionMetricSnapshot"("companyId", "capturedOn");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SuccessionMetricSnapshot_companyId_capturedOn_key" ON "SuccessionMetricSnapshot"("companyId", "capturedOn");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SuccessionReport_companyId_status_idx" ON "SuccessionReport"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SuccessionReport_createdById_status_idx" ON "SuccessionReport"("createdById", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SuccessionReport_companyId_generatedAt_idx" ON "SuccessionReport"("companyId", "generatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SuccessionReportHistory_reportId_idx" ON "SuccessionReportHistory"("reportId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SuccessionReportHistory_actorId_idx" ON "SuccessionReportHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SuccessionReportHistory_createdAt_idx" ON "SuccessionReportHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SuccessionReportHistory_companyId_createdAt_idx" ON "SuccessionReportHistory"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "IntelligenceSettings_companyId_key" ON "IntelligenceSettings"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntelligenceSettingsHistory_settingsId_idx" ON "IntelligenceSettingsHistory"("settingsId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntelligenceSettingsHistory_actorId_idx" ON "IntelligenceSettingsHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntelligenceSettingsHistory_companyId_createdAt_idx" ON "IntelligenceSettingsHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntelligenceReport_companyId_createdAt_idx" ON "IntelligenceReport"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntelligenceReport_companyId_type_status_idx" ON "IntelligenceReport"("companyId", "type", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntelligenceReport_cycleId_idx" ON "IntelligenceReport"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntelligenceReport_createdById_idx" ON "IntelligenceReport"("createdById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntelligenceReport_expiresAt_idx" ON "IntelligenceReport"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "IntelligenceReportShare_tokenHash_key" ON "IntelligenceReportShare"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntelligenceReportShare_reportId_idx" ON "IntelligenceReportShare"("reportId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntelligenceReportShare_companyId_expiresAt_idx" ON "IntelligenceReportShare"("companyId", "expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntelligenceReportEvent_reportId_createdAt_idx" ON "IntelligenceReportEvent"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntelligenceReportEvent_shareId_idx" ON "IntelligenceReportEvent"("shareId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntelligenceReportEvent_actorId_idx" ON "IntelligenceReportEvent"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntelligenceReportEvent_companyId_createdAt_idx" ON "IntelligenceReportEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutomationRule_companyId_removedAt_idx" ON "AutomationRule"("companyId", "removedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutomationRule_companyId_status_idx" ON "AutomationRule"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutomationRule_companyId_category_idx" ON "AutomationRule"("companyId", "category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutomationRule_companyId_trigger_idx" ON "AutomationRule"("companyId", "trigger");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutomationRule_companyId_governanceType_idx" ON "AutomationRule"("companyId", "governanceType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutomationRuleRun_ruleId_mode_startedAt_idx" ON "AutomationRuleRun"("ruleId", "mode", "startedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutomationRuleRun_companyId_mode_startedAt_idx" ON "AutomationRuleRun"("companyId", "mode", "startedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutomationRuleRun_targetStaffRecordId_idx" ON "AutomationRuleRun"("targetStaffRecordId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AutomationRuleRun_ruleId_dedupeKey_key" ON "AutomationRuleRun"("ruleId", "dedupeKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutomationNotification_companyId_removedAt_idx" ON "AutomationNotification"("companyId", "removedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutomationNotification_companyId_enabled_idx" ON "AutomationNotification"("companyId", "enabled");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutomationHistory_companyId_createdAt_idx" ON "AutomationHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutomationHistory_entityType_entityId_createdAt_idx" ON "AutomationHistory"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutomationHistory_actorId_idx" ON "AutomationHistory"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutomationEvent_companyId_processedAt_claimedAt_occurredAt_idx" ON "AutomationEvent"("companyId", "processedAt", "claimedAt", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AutomationEvent_companyId_eventKey_key" ON "AutomationEvent"("companyId", "eventKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutomationExecutorTick_companyId_startedAt_idx" ON "AutomationExecutorTick"("companyId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AutomationExecutorTick_companyId_slotKey_key" ON "AutomationExecutorTick"("companyId", "slotKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessSignal_companyId_cycleId_status_idx" ON "FairnessSignal"("companyId", "cycleId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessSignal_companyId_cycleId_category_status_idx" ON "FairnessSignal"("companyId", "cycleId", "category", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessSignal_companyId_managerId_idx" ON "FairnessSignal"("companyId", "managerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessSignal_departmentId_idx" ON "FairnessSignal"("departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessSignal_cycleId_idx" ON "FairnessSignal"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FairnessSignal_companyId_signalKey_key" ON "FairnessSignal"("companyId", "signalKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessSignalHistory_signalId_idx" ON "FairnessSignalHistory"("signalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessSignalHistory_createdAt_idx" ON "FairnessSignalHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessSignalHistory_companyId_createdAt_idx" ON "FairnessSignalHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessDetectionRun_companyId_ranAt_idx" ON "FairnessDetectionRun"("companyId", "ranAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FairnessDetectionRun_companyId_cycleId_key" ON "FairnessDetectionRun"("companyId", "cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessMetricSnapshot_companyId_capturedOn_idx" ON "FairnessMetricSnapshot"("companyId", "capturedOn");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FairnessMetricSnapshot_companyId_capturedOn_key" ON "FairnessMetricSnapshot"("companyId", "capturedOn");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FairnessCase_openKey_key" ON "FairnessCase"("openKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessCase_companyId_status_idx" ON "FairnessCase"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessCase_companyId_managerId_idx" ON "FairnessCase"("companyId", "managerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessCase_companyId_departmentId_idx" ON "FairnessCase"("companyId", "departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessCase_companyId_lastActivityAt_idx" ON "FairnessCase"("companyId", "lastActivityAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessCase_companyId_resolvedAt_idx" ON "FairnessCase"("companyId", "resolvedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessCase_assignedToId_idx" ON "FairnessCase"("assignedToId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessCase_escalatedToId_idx" ON "FairnessCase"("escalatedToId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessCase_cycleId_idx" ON "FairnessCase"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FairnessCase_companyId_caseNumber_key" ON "FairnessCase"("companyId", "caseNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FairnessCaseSignal_activeKey_key" ON "FairnessCaseSignal"("activeKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessCaseSignal_signalId_idx" ON "FairnessCaseSignal"("signalId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FairnessCaseSignal_caseId_signalId_key" ON "FairnessCaseSignal"("caseId", "signalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessCaseNote_caseId_createdAt_idx" ON "FairnessCaseNote"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessCaseHistory_caseId_createdAt_idx" ON "FairnessCaseHistory"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessCaseHistory_createdAt_idx" ON "FairnessCaseHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessCaseHistory_companyId_createdAt_idx" ON "FairnessCaseHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessReport_companyId_status_idx" ON "FairnessReport"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessReport_companyId_generatedAt_idx" ON "FairnessReport"("companyId", "generatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessReportHistory_reportId_idx" ON "FairnessReportHistory"("reportId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessReportHistory_createdAt_idx" ON "FairnessReportHistory"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FairnessReportHistory_companyId_createdAt_idx" ON "FairnessReportHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "onboarding_template_tasks_templateId_idx" ON "onboarding_template_tasks"("templateId");

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "candidate_experiences" ADD CONSTRAINT "candidate_experiences_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "candidate_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "candidate_educations" ADD CONSTRAINT "candidate_educations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "candidate_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "candidate_account_documents" ADD CONSTRAINT "candidate_account_documents_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "candidate_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "candidate_account_document_blobs" ADD CONSTRAINT "candidate_account_document_blobs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "candidate_account_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "candidate_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "job_alert_preferences" ADD CONSTRAINT "job_alert_preferences_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "candidate_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "job_alert_deliveries" ADD CONSTRAINT "job_alert_deliveries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "candidate_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "job_alert_deliveries" ADD CONSTRAINT "job_alert_deliveries_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "candidates" ADD CONSTRAINT "candidates_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "candidate_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "loan_requests" ADD CONSTRAINT "loan_requests_guarantorStaffId_fkey" FOREIGN KEY ("guarantorStaffId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "benefit_allocations" ADD CONSTRAINT "benefit_allocations_allocatedBy_fkey" FOREIGN KEY ("allocatedBy") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "benefit_claims" ADD CONSTRAINT "benefit_claims_benefitAllocationId_fkey" FOREIGN KEY ("benefitAllocationId") REFERENCES "benefit_allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Designation" ADD CONSTRAINT "Designation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "staff_career_histories" ADD CONSTRAINT "staff_career_histories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "staff_career_histories" ADD CONSTRAINT "staff_career_histories_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "staff_career_histories" ADD CONSTRAINT "staff_career_histories_previousDesignationId_fkey" FOREIGN KEY ("previousDesignationId") REFERENCES "Designation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "staff_career_histories" ADD CONSTRAINT "staff_career_histories_newDesignationId_fkey" FOREIGN KEY ("newDesignationId") REFERENCES "Designation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Competency" ADD CONSTRAINT "Competency_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Competency" ADD CONSTRAINT "Competency_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Competency" ADD CONSTRAINT "Competency_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "ProficiencyScale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CompetencyBenchmark" ADD CONSTRAINT "CompetencyBenchmark_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CompetencyBenchmark" ADD CONSTRAINT "CompetencyBenchmark_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "ProficiencyLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CompetencyRoleMapping" ADD CONSTRAINT "CompetencyRoleMapping_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CompetencyRoleMapping" ADD CONSTRAINT "CompetencyRoleMapping_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "Designation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CompetencyDepartmentMapping" ADD CONSTRAINT "CompetencyDepartmentMapping_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CompetencyDepartmentMapping" ADD CONSTRAINT "CompetencyDepartmentMapping_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CompetencyHistory" ADD CONSTRAINT "CompetencyHistory_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CompetencyHistory" ADD CONSTRAINT "CompetencyHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CompetencyReview" ADD CONSTRAINT "CompetencyReview_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CompetencyReview" ADD CONSTRAINT "CompetencyReview_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CompetencyReview" ADD CONSTRAINT "CompetencyReview_scheduledById_fkey" FOREIGN KEY ("scheduledById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CompetencyReview" ADD CONSTRAINT "CompetencyReview_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CompetencyDuplicateDismissal" ADD CONSTRAINT "CompetencyDuplicateDismissal_competencyAId_fkey" FOREIGN KEY ("competencyAId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CompetencyDuplicateDismissal" ADD CONSTRAINT "CompetencyDuplicateDismissal_competencyBId_fkey" FOREIGN KEY ("competencyBId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CompetencyDuplicateDismissal" ADD CONSTRAINT "CompetencyDuplicateDismissal_dismissedById_fkey" FOREIGN KEY ("dismissedById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ProficiencyScale" ADD CONSTRAINT "ProficiencyScale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ProficiencyLevel" ADD CONSTRAINT "ProficiencyLevel_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "ProficiencyScale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ReviewTemplate" ADD CONSTRAINT "ReviewTemplate_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ReviewTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ReviewTemplate" ADD CONSTRAINT "ReviewTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ReviewTemplate" ADD CONSTRAINT "ReviewTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ReviewTemplateVersion" ADD CONSTRAINT "ReviewTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReviewTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "TemplateSection" ADD CONSTRAINT "TemplateSection_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ReviewTemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "TemplateQuestion" ADD CONSTRAINT "TemplateQuestion_bankItemId_fkey" FOREIGN KEY ("bankItemId") REFERENCES "QuestionBankItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "TemplateQuestion" ADD CONSTRAINT "TemplateQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TemplateSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "TemplateQuestion" ADD CONSTRAINT "TemplateQuestion_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "TemplateQuestion" ADD CONSTRAINT "TemplateQuestion_proficiencyScaleId_fkey" FOREIGN KEY ("proficiencyScaleId") REFERENCES "ProficiencyScale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "TemplateQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_proficiencyScaleId_fkey" FOREIGN KEY ("proficiencyScaleId") REFERENCES "ProficiencyScale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "QuestionBankOption" ADD CONSTRAINT "QuestionBankOption_bankItemId_fkey" FOREIGN KEY ("bankItemId") REFERENCES "QuestionBankItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "TemplateAudienceScope" ADD CONSTRAINT "TemplateAudienceScope_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ReviewTemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "TemplateAssignment" ADD CONSTRAINT "TemplateAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReviewTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "TemplateAssignment" ADD CONSTRAINT "TemplateAssignment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ReviewTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "TemplateAssignment" ADD CONSTRAINT "TemplateAssignment_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "TemplateAssignmentDepartmentScope" ADD CONSTRAINT "TemplateAssignmentDepartmentScope_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TemplateAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "TemplateAssignmentDepartmentScope" ADD CONSTRAINT "TemplateAssignmentDepartmentScope_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "TemplateAssignmentJobLevelScope" ADD CONSTRAINT "TemplateAssignmentJobLevelScope_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TemplateAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "TemplateHistory" ADD CONSTRAINT "TemplateHistory_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReviewTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "TemplateHistory" ADD CONSTRAINT "TemplateHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalCycle" ADD CONSTRAINT "AppraisalCycle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalCycle" ADD CONSTRAINT "AppraisalCycle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalCycleDepartmentScope" ADD CONSTRAINT "AppraisalCycleDepartmentScope_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalCycleDepartmentScope" ADD CONSTRAINT "AppraisalCycleDepartmentScope_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalCyclePhase" ADD CONSTRAINT "AppraisalCyclePhase_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalCycleHistory" ADD CONSTRAINT "AppraisalCycleHistory_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalCycleHistory" ADD CONSTRAINT "AppraisalCycleHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalCycleParticipant" ADD CONSTRAINT "AppraisalCycleParticipant_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalCycleParticipant" ADD CONSTRAINT "AppraisalCycleParticipant_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalCycleParticipant" ADD CONSTRAINT "AppraisalCycleParticipant_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalCycleParticipant" ADD CONSTRAINT "AppraisalCycleParticipant_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalCycleParticipant" ADD CONSTRAINT "AppraisalCycleParticipant_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "Designation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalCycleParticipant" ADD CONSTRAINT "AppraisalCycleParticipant_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalParticipantPhase" ADD CONSTRAINT "AppraisalParticipantPhase_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "AppraisalCycleParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalWorkflowSettings" ADD CONSTRAINT "AppraisalWorkflowSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalSettingsHistory" ADD CONSTRAINT "AppraisalSettingsHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalSettingsHistory" ADD CONSTRAINT "AppraisalSettingsHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalPeerAssignment" ADD CONSTRAINT "AppraisalPeerAssignment_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalPeerAssignment" ADD CONSTRAINT "AppraisalPeerAssignment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "AppraisalCycleParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalPeerAssignment" ADD CONSTRAINT "AppraisalPeerAssignment_reviewerStaffId_fkey" FOREIGN KEY ("reviewerStaffId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalCycleExclusion" ADD CONSTRAINT "AppraisalCycleExclusion_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Goal" ADD CONSTRAINT "Goal_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Goal" ADD CONSTRAINT "Goal_parentGoalId_fkey" FOREIGN KEY ("parentGoalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Goal" ADD CONSTRAINT "Goal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Goal" ADD CONSTRAINT "Goal_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Goal" ADD CONSTRAINT "Goal_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Goal" ADD CONSTRAINT "Goal_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Goal" ADD CONSTRAINT "Goal_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Goal" ADD CONSTRAINT "Goal_orgObjectiveId_fkey" FOREIGN KEY ("orgObjectiveId") REFERENCES "OrgObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalMilestone" ADD CONSTRAINT "GoalMilestone_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalProgressUpdate" ADD CONSTRAINT "GoalProgressUpdate_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalProgressUpdate" ADD CONSTRAINT "GoalProgressUpdate_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalEvidence" ADD CONSTRAINT "GoalEvidence_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalEvidence" ADD CONSTRAINT "GoalEvidence_progressUpdateId_fkey" FOREIGN KEY ("progressUpdateId") REFERENCES "GoalProgressUpdate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalEvidence" ADD CONSTRAINT "GoalEvidence_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalHistory" ADD CONSTRAINT "GoalHistory_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalHistory" ADD CONSTRAINT "GoalHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalComment" ADD CONSTRAINT "GoalComment_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalComment" ADD CONSTRAINT "GoalComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "OrgObjective" ADD CONSTRAINT "OrgObjective_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "OrgObjective" ADD CONSTRAINT "OrgObjective_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "OrgObjective" ADD CONSTRAINT "OrgObjective_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "OrgObjective" ADD CONSTRAINT "OrgObjective_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "OrgObjective" ADD CONSTRAINT "OrgObjective_parentObjectiveId_fkey" FOREIGN KEY ("parentObjectiveId") REFERENCES "OrgObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalDependency" ADD CONSTRAINT "GoalDependency_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalDependency" ADD CONSTRAINT "GoalDependency_dependsOnGoalId_fkey" FOREIGN KEY ("dependsOnGoalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalConflict" ADD CONSTRAINT "GoalConflict_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalConflict" ADD CONSTRAINT "GoalConflict_goalAId_fkey" FOREIGN KEY ("goalAId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalConflict" ADD CONSTRAINT "GoalConflict_goalBId_fkey" FOREIGN KEY ("goalBId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalConflict" ADD CONSTRAINT "GoalConflict_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalConflict" ADD CONSTRAINT "GoalConflict_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalConflictResolution" ADD CONSTRAINT "GoalConflictResolution_conflictId_fkey" FOREIGN KEY ("conflictId") REFERENCES "GoalConflict"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalActivity" ADD CONSTRAINT "GoalActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalActivity" ADD CONSTRAINT "GoalActivity_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalActivity" ADD CONSTRAINT "GoalActivity_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalActivity" ADD CONSTRAINT "GoalActivity_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalAiAnalysis" ADD CONSTRAINT "GoalAiAnalysis_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalAiAnalysis" ADD CONSTRAINT "GoalAiAnalysis_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GoalAiAnalysis" ADD CONSTRAINT "GoalAiAnalysis_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "StaffWorkloadCapacity" ADD CONSTRAINT "StaffWorkloadCapacity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "StaffWorkloadCapacity" ADD CONSTRAINT "StaffWorkloadCapacity_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SelfAppraisal" ADD CONSTRAINT "SelfAppraisal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SelfAppraisal" ADD CONSTRAINT "SelfAppraisal_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SelfAppraisal" ADD CONSTRAINT "SelfAppraisal_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "AppraisalCycleParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SelfAppraisal" ADD CONSTRAINT "SelfAppraisal_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SelfAppraisal" ADD CONSTRAINT "SelfAppraisal_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "ReviewTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SelfAppraisalGoalReflection" ADD CONSTRAINT "SelfAppraisalGoalReflection_selfAppraisalId_fkey" FOREIGN KEY ("selfAppraisalId") REFERENCES "SelfAppraisal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SelfAppraisalGoalReflection" ADD CONSTRAINT "SelfAppraisalGoalReflection_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SelfAppraisalCompetencyRating" ADD CONSTRAINT "SelfAppraisalCompetencyRating_selfAppraisalId_fkey" FOREIGN KEY ("selfAppraisalId") REFERENCES "SelfAppraisal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SelfAppraisalCompetencyRating" ADD CONSTRAINT "SelfAppraisalCompetencyRating_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SelfAppraisalEvidence" ADD CONSTRAINT "SelfAppraisalEvidence_goalReflectionId_fkey" FOREIGN KEY ("goalReflectionId") REFERENCES "SelfAppraisalGoalReflection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SelfAppraisalEvidence" ADD CONSTRAINT "SelfAppraisalEvidence_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SelfAppraisalHistory" ADD CONSTRAINT "SelfAppraisalHistory_selfAppraisalId_fkey" FOREIGN KEY ("selfAppraisalId") REFERENCES "SelfAppraisal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SelfAppraisalHistory" ADD CONSTRAINT "SelfAppraisalHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ManagerReview" ADD CONSTRAINT "ManagerReview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ManagerReview" ADD CONSTRAINT "ManagerReview_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ManagerReview" ADD CONSTRAINT "ManagerReview_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "AppraisalCycleParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ManagerReview" ADD CONSTRAINT "ManagerReview_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ManagerReview" ADD CONSTRAINT "ManagerReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ManagerReview" ADD CONSTRAINT "ManagerReview_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "ReviewTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ManagerReviewCompetencyRating" ADD CONSTRAINT "ManagerReviewCompetencyRating_managerReviewId_fkey" FOREIGN KEY ("managerReviewId") REFERENCES "ManagerReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ManagerReviewCompetencyRating" ADD CONSTRAINT "ManagerReviewCompetencyRating_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ManagerReviewHistory" ADD CONSTRAINT "ManagerReviewHistory_managerReviewId_fkey" FOREIGN KEY ("managerReviewId") REFERENCES "ManagerReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ManagerReviewHistory" ADD CONSTRAINT "ManagerReviewHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PerformanceAction" ADD CONSTRAINT "PerformanceAction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PerformanceAction" ADD CONSTRAINT "PerformanceAction_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PerformanceAction" ADD CONSTRAINT "PerformanceAction_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PerformanceAction" ADD CONSTRAINT "PerformanceAction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PerformanceActionAttachment" ADD CONSTRAINT "PerformanceActionAttachment_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "PerformanceAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PerformanceActionAttachment" ADD CONSTRAINT "PerformanceActionAttachment_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PerformanceActionHistory" ADD CONSTRAINT "PerformanceActionHistory_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "PerformanceAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PerformanceActionHistory" ADD CONSTRAINT "PerformanceActionHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalEscalation" ADD CONSTRAINT "AppraisalEscalation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalEscalation" ADD CONSTRAINT "AppraisalEscalation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalEscalation" ADD CONSTRAINT "AppraisalEscalation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalEscalation" ADD CONSTRAINT "AppraisalEscalation_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalEscalation" ADD CONSTRAINT "AppraisalEscalation_raisedBy_fkey" FOREIGN KEY ("raisedBy") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalEscalation" ADD CONSTRAINT "AppraisalEscalation_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalEscalation" ADD CONSTRAINT "AppraisalEscalation_pipId_fkey" FOREIGN KEY ("pipId") REFERENCES "Pip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalEscalationHistory" ADD CONSTRAINT "AppraisalEscalationHistory_escalationId_fkey" FOREIGN KEY ("escalationId") REFERENCES "AppraisalEscalation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalEscalationHistory" ADD CONSTRAINT "AppraisalEscalationHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PerformanceOpsNote" ADD CONSTRAINT "PerformanceOpsNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PerformanceOpsNote" ADD CONSTRAINT "PerformanceOpsNote_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PerformanceOpsNote" ADD CONSTRAINT "PerformanceOpsNote_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PerformanceOpsNote" ADD CONSTRAINT "PerformanceOpsNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalBulkOperation" ADD CONSTRAINT "AppraisalBulkOperation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalBulkOperation" ADD CONSTRAINT "AppraisalBulkOperation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalBulkOperation" ADD CONSTRAINT "AppraisalBulkOperation_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalPolicyException" ADD CONSTRAINT "AppraisalPolicyException_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalPolicyException" ADD CONSTRAINT "AppraisalPolicyException_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalPolicyException" ADD CONSTRAINT "AppraisalPolicyException_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalPolicyException" ADD CONSTRAINT "AppraisalPolicyException_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalPolicyExceptionParticipant" ADD CONSTRAINT "AppraisalPolicyExceptionParticipant_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "AppraisalPolicyException"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalPolicyExceptionParticipant" ADD CONSTRAINT "AppraisalPolicyExceptionParticipant_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "AppraisalCycleParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CalibrationRecord" ADD CONSTRAINT "CalibrationRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CalibrationRecord" ADD CONSTRAINT "CalibrationRecord_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CalibrationRecord" ADD CONSTRAINT "CalibrationRecord_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "AppraisalCycleParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CalibrationRecord" ADD CONSTRAINT "CalibrationRecord_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CalibrationSession" ADD CONSTRAINT "CalibrationSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CalibrationSession" ADD CONSTRAINT "CalibrationSession_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CalibrationSession" ADD CONSTRAINT "CalibrationSession_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CalibrationSession" ADD CONSTRAINT "CalibrationSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CalibrationSessionAttendee" ADD CONSTRAINT "CalibrationSessionAttendee_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CalibrationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CalibrationSessionAttendee" ADD CONSTRAINT "CalibrationSessionAttendee_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CalibrationHistory" ADD CONSTRAINT "CalibrationHistory_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "CalibrationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CalibrationHistory" ADD CONSTRAINT "CalibrationHistory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CalibrationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CalibrationHistory" ADD CONSTRAINT "CalibrationHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_recognitionId_fkey" FOREIGN KEY ("recognitionId") REFERENCES "Recognition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FeedbackRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FeedbackLike" ADD CONSTRAINT "FeedbackLike_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FeedbackLike" ADD CONSTRAINT "FeedbackLike_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FeedbackBookmark" ADD CONSTRAINT "FeedbackBookmark_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FeedbackBookmark" ADD CONSTRAINT "FeedbackBookmark_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FeedbackComment" ADD CONSTRAINT "FeedbackComment_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FeedbackComment" ADD CONSTRAINT "FeedbackComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_giverId_fkey" FOREIGN KEY ("giverId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FeedbackHistory" ADD CONSTRAINT "FeedbackHistory_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FeedbackHistory" ADD CONSTRAINT "FeedbackHistory_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FeedbackRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FeedbackHistory" ADD CONSTRAINT "FeedbackHistory_recognitionId_fkey" FOREIGN KEY ("recognitionId") REFERENCES "Recognition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FeedbackHistory" ADD CONSTRAINT "FeedbackHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "RecognitionReaction" ADD CONSTRAINT "RecognitionReaction_recognitionId_fkey" FOREIGN KEY ("recognitionId") REFERENCES "Recognition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "RecognitionReaction" ADD CONSTRAINT "RecognitionReaction_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentMilestone" ADD CONSTRAINT "DevelopmentMilestone_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DevelopmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentPlanActivity" ADD CONSTRAINT "DevelopmentPlanActivity_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DevelopmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentPlanActivity" ADD CONSTRAINT "DevelopmentPlanActivity_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "training_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentPlanActivity" ADD CONSTRAINT "DevelopmentPlanActivity_certificationTypeId_fkey" FOREIGN KEY ("certificationTypeId") REFERENCES "certification_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentPlanActivity" ADD CONSTRAINT "DevelopmentPlanActivity_coachingRequestId_fkey" FOREIGN KEY ("coachingRequestId") REFERENCES "DevelopmentCoachingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentPlanEvidence" ADD CONSTRAINT "DevelopmentPlanEvidence_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DevelopmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentPlanEvidence" ADD CONSTRAINT "DevelopmentPlanEvidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentCoachingRequest" ADD CONSTRAINT "DevelopmentCoachingRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentCoachingRequest" ADD CONSTRAINT "DevelopmentCoachingRequest_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DevelopmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentCoachingRequest" ADD CONSTRAINT "DevelopmentCoachingRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentCoachingRequest" ADD CONSTRAINT "DevelopmentCoachingRequest_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentCoachingRequest" ADD CONSTRAINT "DevelopmentCoachingRequest_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentCoachingRequest" ADD CONSTRAINT "DevelopmentCoachingRequest_focusCompetencyId_fkey" FOREIGN KEY ("focusCompetencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentPlanHistory" ADD CONSTRAINT "DevelopmentPlanHistory_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DevelopmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "DevelopmentPlanHistory" ADD CONSTRAINT "DevelopmentPlanHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Pip" ADD CONSTRAINT "Pip_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Pip" ADD CONSTRAINT "Pip_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Pip" ADD CONSTRAINT "Pip_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Pip" ADD CONSTRAINT "Pip_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Pip" ADD CONSTRAINT "Pip_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Pip" ADD CONSTRAINT "Pip_managerReviewId_fkey" FOREIGN KEY ("managerReviewId") REFERENCES "ManagerReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Pip" ADD CONSTRAINT "Pip_performanceActionId_fkey" FOREIGN KEY ("performanceActionId") REFERENCES "PerformanceAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Pip" ADD CONSTRAINT "Pip_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Pip" ADD CONSTRAINT "Pip_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "Designation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipMilestone" ADD CONSTRAINT "PipMilestone_improvementObjectiveId_fkey" FOREIGN KEY ("improvementObjectiveId") REFERENCES "PipImprovementObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipMilestone" ADD CONSTRAINT "PipMilestone_pipId_fkey" FOREIGN KEY ("pipId") REFERENCES "Pip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipHistory" ADD CONSTRAINT "PipHistory_pipId_fkey" FOREIGN KEY ("pipId") REFERENCES "Pip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipHistory" ADD CONSTRAINT "PipHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipCoachingSession" ADD CONSTRAINT "PipCoachingSession_pipId_fkey" FOREIGN KEY ("pipId") REFERENCES "Pip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipCoachingSession" ADD CONSTRAINT "PipCoachingSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipCoachingSession" ADD CONSTRAINT "PipCoachingSession_improvementObjectiveId_fkey" FOREIGN KEY ("improvementObjectiveId") REFERENCES "PipImprovementObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipActionItem" ADD CONSTRAINT "PipActionItem_pipId_fkey" FOREIGN KEY ("pipId") REFERENCES "Pip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipActionItem" ADD CONSTRAINT "PipActionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PipCoachingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipActionItem" ADD CONSTRAINT "PipActionItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipKpiSnapshot" ADD CONSTRAINT "PipKpiSnapshot_pipId_fkey" FOREIGN KEY ("pipId") REFERENCES "Pip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalEscalationComment" ADD CONSTRAINT "AppraisalEscalationComment_escalationId_fkey" FOREIGN KEY ("escalationId") REFERENCES "AppraisalEscalation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalEscalationComment" ADD CONSTRAINT "AppraisalEscalationComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalEscalationAttachment" ADD CONSTRAINT "AppraisalEscalationAttachment_escalationId_fkey" FOREIGN KEY ("escalationId") REFERENCES "AppraisalEscalation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AppraisalEscalationAttachment" ADD CONSTRAINT "AppraisalEscalationAttachment_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipImprovementObjective" ADD CONSTRAINT "PipImprovementObjective_pipId_fkey" FOREIGN KEY ("pipId") REFERENCES "Pip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipProgressUpdate" ADD CONSTRAINT "PipProgressUpdate_improvementObjectiveId_fkey" FOREIGN KEY ("improvementObjectiveId") REFERENCES "PipImprovementObjective"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipTraining" ADD CONSTRAINT "PipTraining_pipId_fkey" FOREIGN KEY ("pipId") REFERENCES "Pip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipTraining" ADD CONSTRAINT "PipTraining_improvementObjectiveId_fkey" FOREIGN KEY ("improvementObjectiveId") REFERENCES "PipImprovementObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipTraining" ADD CONSTRAINT "PipTraining_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "training_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipTraining" ADD CONSTRAINT "PipTraining_certificationTypeId_fkey" FOREIGN KEY ("certificationTypeId") REFERENCES "certification_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipWeeklyCheckIn" ADD CONSTRAINT "PipWeeklyCheckIn_pipId_fkey" FOREIGN KEY ("pipId") REFERENCES "Pip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipSupportRequest" ADD CONSTRAINT "PipSupportRequest_improvementObjectiveId_fkey" FOREIGN KEY ("improvementObjectiveId") REFERENCES "PipImprovementObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipSupportRequest" ADD CONSTRAINT "PipSupportRequest_pipId_fkey" FOREIGN KEY ("pipId") REFERENCES "Pip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipSupportRequest" ADD CONSTRAINT "PipSupportRequest_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipEvidence" ADD CONSTRAINT "PipEvidence_pipId_fkey" FOREIGN KEY ("pipId") REFERENCES "Pip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipEvidence" ADD CONSTRAINT "PipEvidence_improvementObjectiveId_fkey" FOREIGN KEY ("improvementObjectiveId") REFERENCES "PipImprovementObjective"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipEvidence" ADD CONSTRAINT "PipEvidence_progressUpdateId_fkey" FOREIGN KEY ("progressUpdateId") REFERENCES "PipProgressUpdate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipEvidence" ADD CONSTRAINT "PipEvidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipProgressDraft" ADD CONSTRAINT "PipProgressDraft_pipId_fkey" FOREIGN KEY ("pipId") REFERENCES "Pip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipProgressDraft" ADD CONSTRAINT "PipProgressDraft_improvementObjectiveId_fkey" FOREIGN KEY ("improvementObjectiveId") REFERENCES "PipImprovementObjective"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipProgressDraft" ADD CONSTRAINT "PipProgressDraft_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PromotionRecommendation" ADD CONSTRAINT "PromotionRecommendation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PromotionRecommendation" ADD CONSTRAINT "PromotionRecommendation_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PromotionRecommendation" ADD CONSTRAINT "PromotionRecommendation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PromotionRecommendation" ADD CONSTRAINT "PromotionRecommendation_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PromotionRecommendation" ADD CONSTRAINT "PromotionRecommendation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PromotionRecommendation" ADD CONSTRAINT "PromotionRecommendation_basisReviewId_fkey" FOREIGN KEY ("basisReviewId") REFERENCES "ManagerReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PromotionRecommendation" ADD CONSTRAINT "PromotionRecommendation_currentDesignationId_fkey" FOREIGN KEY ("currentDesignationId") REFERENCES "Designation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PromotionRecommendation" ADD CONSTRAINT "PromotionRecommendation_targetDesignationId_fkey" FOREIGN KEY ("targetDesignationId") REFERENCES "Designation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PromotionRecommendation" ADD CONSTRAINT "PromotionRecommendation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PromotionAttachment" ADD CONSTRAINT "PromotionAttachment_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "PromotionRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PromotionAttachment" ADD CONSTRAINT "PromotionAttachment_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PromotionHistory" ADD CONSTRAINT "PromotionHistory_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "PromotionRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PromotionHistory" ADD CONSTRAINT "PromotionHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CareerDevelopmentAssignment" ADD CONSTRAINT "CareerDevelopmentAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CareerDevelopmentAssignment" ADD CONSTRAINT "CareerDevelopmentAssignment_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CareerDevelopmentAssignment" ADD CONSTRAINT "CareerDevelopmentAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CareerDevelopmentAssignment" ADD CONSTRAINT "CareerDevelopmentAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DevelopmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CriticalRole" ADD CONSTRAINT "CriticalRole_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CriticalRole" ADD CONSTRAINT "CriticalRole_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "Designation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "CriticalRole" ADD CONSTRAINT "CriticalRole_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SuccessionCandidate" ADD CONSTRAINT "SuccessionCandidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SuccessionCandidate" ADD CONSTRAINT "SuccessionCandidate_criticalRoleId_fkey" FOREIGN KEY ("criticalRoleId") REFERENCES "CriticalRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SuccessionCandidate" ADD CONSTRAINT "SuccessionCandidate_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SuccessionCandidate" ADD CONSTRAINT "SuccessionCandidate_nominatedById_fkey" FOREIGN KEY ("nominatedById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SuccessionHistory" ADD CONSTRAINT "SuccessionHistory_criticalRoleId_fkey" FOREIGN KEY ("criticalRoleId") REFERENCES "CriticalRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SuccessionHistory" ADD CONSTRAINT "SuccessionHistory_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "SuccessionCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SuccessionHistory" ADD CONSTRAINT "SuccessionHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ComparisonReport" ADD CONSTRAINT "ComparisonReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ComparisonReport" ADD CONSTRAINT "ComparisonReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ComparisonReport" ADD CONSTRAINT "ComparisonReport_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ComparisonReportHistory" ADD CONSTRAINT "ComparisonReportHistory_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ComparisonReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "ComparisonReportHistory" ADD CONSTRAINT "ComparisonReportHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "performance_audit_events" ADD CONSTRAINT "performance_audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "performance_audit_events" ADD CONSTRAINT "performance_audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "performance_audit_events" ADD CONSTRAINT "performance_audit_events_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "audit_investigation_cases" ADD CONSTRAINT "audit_investigation_cases_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "audit_investigation_cases" ADD CONSTRAINT "audit_investigation_cases_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "audit_investigation_cases" ADD CONSTRAINT "audit_investigation_cases_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "audit_investigation_cases" ADD CONSTRAINT "audit_investigation_cases_relatedEventId_fkey" FOREIGN KEY ("relatedEventId") REFERENCES "performance_audit_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "audit_investigation_cases" ADD CONSTRAINT "audit_investigation_cases_anomalyId_fkey" FOREIGN KEY ("anomalyId") REFERENCES "audit_anomalies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "audit_investigation_case_notes" ADD CONSTRAINT "audit_investigation_case_notes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "audit_investigation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "audit_investigation_case_notes" ADD CONSTRAINT "audit_investigation_case_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "audit_anomalies" ADD CONSTRAINT "audit_anomalies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "audit_anomalies" ADD CONSTRAINT "audit_anomalies_affectedUserId_fkey" FOREIGN KEY ("affectedUserId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "audit_anomalies" ADD CONSTRAINT "audit_anomalies_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "performance_audit_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "audit_export_jobs" ADD CONSTRAINT "audit_export_jobs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "audit_export_jobs" ADD CONSTRAINT "audit_export_jobs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "audit_compliance_snapshots" ADD CONSTRAINT "audit_compliance_snapshots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SuccessionMetricSnapshot" ADD CONSTRAINT "SuccessionMetricSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SuccessionReport" ADD CONSTRAINT "SuccessionReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SuccessionReport" ADD CONSTRAINT "SuccessionReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SuccessionReportHistory" ADD CONSTRAINT "SuccessionReportHistory_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SuccessionReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "SuccessionReportHistory" ADD CONSTRAINT "SuccessionReportHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "IntelligenceSettings" ADD CONSTRAINT "IntelligenceSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "IntelligenceSettings" ADD CONSTRAINT "IntelligenceSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "IntelligenceSettingsHistory" ADD CONSTRAINT "IntelligenceSettingsHistory_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "IntelligenceSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "IntelligenceSettingsHistory" ADD CONSTRAINT "IntelligenceSettingsHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "IntelligenceReport" ADD CONSTRAINT "IntelligenceReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "IntelligenceReport" ADD CONSTRAINT "IntelligenceReport_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "IntelligenceReport" ADD CONSTRAINT "IntelligenceReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "IntelligenceReportShare" ADD CONSTRAINT "IntelligenceReportShare_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "IntelligenceReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "IntelligenceReportShare" ADD CONSTRAINT "IntelligenceReportShare_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "IntelligenceReportShare" ADD CONSTRAINT "IntelligenceReportShare_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "IntelligenceReportEvent" ADD CONSTRAINT "IntelligenceReportEvent_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "IntelligenceReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "IntelligenceReportEvent" ADD CONSTRAINT "IntelligenceReportEvent_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "IntelligenceReportShare"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "IntelligenceReportEvent" ADD CONSTRAINT "IntelligenceReportEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AutomationRuleRun" ADD CONSTRAINT "AutomationRuleRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AutomationRuleRun" ADD CONSTRAINT "AutomationRuleRun_targetStaffRecordId_fkey" FOREIGN KEY ("targetStaffRecordId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AutomationNotification" ADD CONSTRAINT "AutomationNotification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AutomationHistory" ADD CONSTRAINT "AutomationHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AutomationEvent" ADD CONSTRAINT "AutomationEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "AutomationExecutorTick" ADD CONSTRAINT "AutomationExecutorTick_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessSignal" ADD CONSTRAINT "FairnessSignal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessSignal" ADD CONSTRAINT "FairnessSignal_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessSignal" ADD CONSTRAINT "FairnessSignal_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessSignal" ADD CONSTRAINT "FairnessSignal_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessSignalHistory" ADD CONSTRAINT "FairnessSignalHistory_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "FairnessSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessDetectionRun" ADD CONSTRAINT "FairnessDetectionRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessDetectionRun" ADD CONSTRAINT "FairnessDetectionRun_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessMetricSnapshot" ADD CONSTRAINT "FairnessMetricSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessCase" ADD CONSTRAINT "FairnessCase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessCase" ADD CONSTRAINT "FairnessCase_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessCase" ADD CONSTRAINT "FairnessCase_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessCase" ADD CONSTRAINT "FairnessCase_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessCase" ADD CONSTRAINT "FairnessCase_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessCase" ADD CONSTRAINT "FairnessCase_escalatedToId_fkey" FOREIGN KEY ("escalatedToId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessCaseSignal" ADD CONSTRAINT "FairnessCaseSignal_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "FairnessCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessCaseSignal" ADD CONSTRAINT "FairnessCaseSignal_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "FairnessSignal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessCaseNote" ADD CONSTRAINT "FairnessCaseNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "FairnessCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessCaseHistory" ADD CONSTRAINT "FairnessCaseHistory_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "FairnessCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessReport" ADD CONSTRAINT "FairnessReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "FairnessReportHistory" ADD CONSTRAINT "FairnessReportHistory_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "FairnessReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
