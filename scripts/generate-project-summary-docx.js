/**
 * ISURFHR Project Summary .docx Generator
 * Generates a comprehensive project overview document
 */

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
  LevelFormat,
  TableOfContents,
  PageBreak,
  Footer,
  Header,
  NumberProperties,
  convertInchesToTwip,
  ShadingType,
} = require("docx");
const fs = require("fs");
const path = require("path");

async function generateDocument() {
  const doc = new Document({
    creator: "ISURFHR Project",
    title: "ISURFHR - Comprehensive Project Summary",
    description: "A detailed summary of the ISURFHR Human Resource Management System",
    styles: {
      default: {
        heading1: {
          run: { size: 32, bold: true, color: "1B4F72" },
          paragraph: { spacing: { before: 360, after: 200 } },
        },
        heading2: {
          run: { size: 26, bold: true, color: "2874A6" },
          paragraph: { spacing: { before: 280, after: 160 } },
        },
        heading3: {
          run: { size: 22, bold: true, color: "1ABC9C" },
          paragraph: { spacing: { before: 200, after: 120 } },
        },
        document: {
          run: { size: 21, font: "Calibri" },
          paragraph: { spacing: { after: 120, line: 276 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.2),
              right: convertInchesToTwip(1.2),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: "ISURFHR - Project Summary",
                    size: 18,
                    color: "888888",
                    italics: true,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "Confidential - Generated ",
                    size: 16,
                    color: "AAAAAA",
                  }),
                  new TextRun({
                    children: [PageBreak],
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          // ==================== TITLE PAGE ====================
          new Paragraph({ spacing: { before: 3000 } }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.TITLE,
            children: [
              new TextRun({ text: "ISURFHR", size: 56, bold: true, color: "1B4F72" }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 600 },
            children: [
              new TextRun({
                text: "Human Resource Management System",
                size: 36,
                color: "2874A6",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: "Comprehensive Project Summary & Architecture Documentation",
                size: 24,
                color: "555555",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 600 },
            children: [
              new TextRun({
                text: `Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
                size: 20,
                color: "888888",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "Version: 1.0.0 | Repository: github.com/WonahGodwino/hrms_backend",
                size: 18,
                color: "888888",
              }),
            ],
          }),
          new Paragraph({ children: [new TextRun({ text: "" })] }),

          // ==================== TABLE OF CONTENTS (manual) ====================
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("Table of Contents")],
          }),
          ...[
            "1. Project Overview",
            "2. Technology Stack",
            "3. Project Architecture & Structure",
            "4. Database Schema Overview",
            "   4.1 Core Models",
            "   4.2 Enumeration Types",
            "5. Module-by-Module Breakdown",
            "   5.1 Company & Multi-Tenancy",
            "   5.2 User & Staff Management",
            "   5.3 Recruitment Pipeline",
            "   5.4 Leave Management",
            "   5.5 Payroll (Standard)",
            "   5.6 Payroll Engine",
            "   5.7 PHED Module (Port Harcourt Client)",
            "   5.8 Tax Management",
            "   5.9 Training & Certification",
            "   5.10 Department Management",
            "   5.11 Grade Levels, Benefits & Allowances",
            "   5.12 Loans & Benefits",
            "   5.13 Attendance Management",
            "   5.14 Notifications & Emails",
            "   5.15 AI / CV Review",
            "6. API Route Architecture",
            "7. Key Services & Libraries",
            "8. Scripts & Automation",
            "9. Deployment & Infrastructure",
            "10. Summary & Key Metrics",
          ].map(
            (t) =>
              new Paragraph({
                spacing: { before: 40, after: 40 },
                children: [
                  new TextRun({ text: t, size: 20, color: "2874A6" }),
                ],
              })
          ),

          // ==================== SECTION 1: PROJECT OVERVIEW ====================
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("1. Project Overview")],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "ISURFHR",
                bold: true,
              }),
              new TextRun(
                " is a comprehensive, multi-tenant Human Resource Management System (HRMS) designed to automate the entire employee lifecycle. From recruitment and onboarding through payroll, tax compliance, leave management, training, and benefits administration, ISURFHR provides a unified platform for organizations to manage their workforce efficiently."
              ),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Project Name: ",
                bold: true,
              }),
              new TextRun("hrms-backend (Package: ISURFHR)"),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Repository: ", bold: true }),
              new TextRun("https://github.com/WonahGodwino/hrms_backend (upstream: github.com/isurfglobal1/ISURFHR)"),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Description: ", bold: true }),
              new TextRun(
                "A platform that automates various HR processes, including recruitment, onboarding, employee records management, leave approvals, task assignment and tracking. It offers a comprehensive solution for managing the employee lifecycle."
              ),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Version: ", bold: true }),
              new TextRun("1.0.0"),
            ],
          }),

          // ==================== SECTION 2: TECH STACK ====================
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("2. Technology Stack")],
          }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("2.1 Core Framework")],
          }),
          ...[
            ["Framework", "Next.js 14 (App Router)"],
            ["Language", "TypeScript 5.9"],
            ["Runtime", "Node.js"],
            ["ORM", "Prisma 7.3 with PostgreSQL adapter"],
            ["Database", "PostgreSQL"],
            ["Authentication", "JWT (jose library), bcryptjs"],
          ].map(
            ([k, v]) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun({ text: k, bold: true }), new TextRun(`: ${v}`)],
              })
          ),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("2.2 Key Dependencies")],
          }),
          ...[
            ["PDF Generation", "PDFKit, @react-pdf/renderer"],
            ["Email", "SendGrid, Mailgun.js, Nodemailer"],
            ["File Processing", "ExcelJS, XLSX, Mammoth (.docx parser), pdf-parse, formidable"],
            ["Payroll Calculations", "decimal.js (precision arithmetic)"],
            ["Charts", "Recharts"],
            ["NLP/AI", "compromise (NLP), natural (NLP), stopword (text processing)"],
            ["Browser Automation", "Puppeteer"],
            ["Validation", "validator, iconv-lite (encoding)"],
            ["Document Generation", "docx"],
          ].map(
            ([k, v]) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun({ text: k, bold: true }), new TextRun(`: ${v}`)],
              })
          ),

          // ==================== SECTION 3: ARCHITECTURE ====================
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("3. Project Architecture & Structure")],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("3.1 Directory Structure")],
          }),
          ...[
            ["src/app/api/", "API route handlers (Next.js App Router)"],
            ["src/app/lib/", "Shared libraries, services, and utilities"],
            ["src/app/lib/services/", "Business logic services (grade-level, allowance-calculator, staff-grade)"],
            ["src/app/lib/payroll/", "Payroll processing, PDF payslip generation"],
            ["src/app/lib/phed/", "PHED module: payroll, tax, reports, CSV parsing"],
            ["src/app/lib/leaves/", "Leave balance engine"],
            ["src/app/lib/notifications/", "Notification helpers and leave notification logic"],
            ["src/app/lib/departments/", "Department utility functions"],
            ["src/app/lib/jobs/", "Job management functions"],
            ["src/app/lib/types/", "TypeScript type definitions"],
            ["src/app/recruitment/", "Recruitment page components"],
            ["src/components/", "React UI components (shared)"],
            ["src/types/", "Global TypeScript type declarations"],
            ["prisma/", "Prisma schema (2855 lines) & migrations"],
            ["scripts/", "Utility scripts (seeding, migration, PDF generation)"],
            ["functions/", "Firebase Cloud Functions"],
            ["public/", "Static assets (payslips, etc.)"],
          ].map(
            ([k, v]) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun({ text: k, bold: true }), new TextRun(` - ${v}`)],
              })
          ),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("3.2 Architectural Patterns")],
          }),
          ...[
            "App Router API Routes: All endpoints follow Next.js 14 route handler conventions under src/app/api/",
            "Multi-Tenancy: Every data model includes a companyId field scoping data to a specific tenant organization",
            "Middleware Pipeline: src/middleware.ts handles authentication, company scope, and CORS",
            "Service Layer: Business logic is abstracted into service classes under src/app/lib/services/",
            "Prisma ORM: Single schema.prisma defines all 60+ models with PostgreSQL provider",
            "Decimal Precision: All financial calculations use Prisma Decimal type with 18,2 precision",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // ==================== SECTION 4: DATABASE SCHEMA ====================
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("4. Database Schema Overview")],
          }),
          new Paragraph({
            children: [
              new TextRun(
                "The database schema (prisma/schema.prisma) spans 2,855 lines and defines 60+ models with comprehensive relationships. The schema uses PostgreSQL as the database provider with Prisma ORM."
              ),
            ],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("4.1 Core Models (Alphabetical)")],
          }),

          // Build a table of all models
          createModelTable(),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("4.2 Enumeration Types")],
          }),
          ...[
            ["ApplicationStatus", "SUBMITTED | REVIEWING | SHORTLISTED | INTERVIEWING | OFFERED | HIRED | REJECTED | WITHDRAWN"],
            ["InterviewType", "PHONE | VIDEO | ONSITE"],
            ["InterviewOutcome", "PENDING | PASSED | FAILED | NO_SHOW"],
            ["OfferStatus", "DRAFT | SENT | ACCEPTED | DECLINED | EXPIRED | WITHDRAWN"],
            ["OnboardingStatus", "NOT_STARTED | IN_PROGRESS | COMPLETED | CANCELLED"],
            ["OnboardingTaskStatus", "PENDING | IN_PROGRESS | DONE | BLOCKED"],
            ["CandidateDocumentType", "CV | COVER_LETTER | ID_CARD | CERTIFICATE | OFFER_LETTER | CONTRACT | NDA | OTHER"],
            ["CandidateFileType", "CV | COVER_LETTER | OTHER"],
            ["PayrollStatus", "DRAFT | PROCESSED | PAID | FAILED"],
            ["JobStatus", "DRAFT | ACTIVE | CLOSED | EXPIRED"],
            ["PayPeriodStatus", "DRAFT | VALIDATION_OPEN | VALIDATION_CLOSED | COMPUTING | REVIEW | APPROVED | PAID"],
            ["ValidationStatus", "PENDING | YES_FOR_PAYMENT | NO_FOR_PAYMENT"],
            ["PaymentStatus", "PENDING | ACTIVE | WITHHELD | PAID"],
            ["EmployeeCategory", "REGULAR | CONTRACT"],
            ["DeductionType", "UNION_DUES | COOPERATIVE | LOAN | SALARY_ADVANCE | OTHER"],
            ["PhedStaffCategory", "REGULAR | CONTRACT | NYSC_IT"],
            ["PhedPayPeriodStatus", "DRAFT | VALIDATION_OPEN | VALIDATION_CLOSED | PROCESSING | REVIEW | APPROVED | PAID"],
            ["GradeStatus", "Active | Inactive"],
            ["BasePayFrequency", "Yearly | Monthly | BiWeekly"],
            ["AllowanceType", "PERCENTAGE | FIXED | TIERED | FORMULA"],
            ["LoanType", "PERSONAL_LOAN | EMERGENCY_LOAN | SALARY_ADVANCE | OTHER"],
            ["LoanRequestStatus", "PENDING | APPROVED | REJECTED | DISBURSED | REPAID | DEFAULTED"],
            ["BenefitRequestStatus", "PENDING | APPROVED | REJECTED | ALLOCATED | COMPLETED | CANCELLED"],
            ["FilingStatus", "PENDING | GENERATED | FILED | CONFIRMED"],
            ["PaymentCycle", "WEEKLY | BI_WEEKLY | MONTHLY"],
          ].map(
            ([k, v]) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun({ text: k, bold: true }), new TextRun(`: ${v}`)],
              })
          ),

          // ==================== SECTION 5: MODULE BREAKDOWN ====================
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("5. Module-by-Module Breakdown")],
          }),

          // 5.1 Company & Multi-Tenancy
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("5.1 Company & Multi-Tenancy")],
          }),
          new Paragraph({
            children: [
              new TextRun("The "),
              new TextRun({ text: "Company", bold: true }),
              new TextRun(
                " model serves as the central tenant entity. Every data record in the system belongs to a company, enabling true multi-tenant isolation. Key attributes include:"
              ),
            ],
          }),
          ...[
            "companyName, address, phone, email, logo, taxId",
            "baseCurrency (default NGN) - supports multi-currency via CompanyExchangeRate",
            "workWeekPattern - flexible work week configuration",
            "archived flag for soft-delete",
            "Workspace-based access via UserCompany (userId + companyId + role)",
            "Module-level access control via CompanyModuleAccess",
            "Platform-level modules defined in PlatformModule",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // 5.2 User & Staff Management
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("5.2 User & Staff Management")],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "StaffRecord", bold: true }),
              new TextRun(
                " is the primary employee/user model with comprehensive fields covering personal info, banking details, employment status, roles, department assignments, grade level, and designation. Key features:"
              ),
            ],
          }),
          ...[
            "Unique identification via staffId+companyId and email+companyId composites",
            "Role-based access: ADMIN, HR, MANAGER, STAFF roles",
            "Password management with bcrypt hashing and OTP-based reset (PasswordReset model)",
            "Manager hierarchy via self-referencing StaffManagers relation",
            "Department assignment with head/assistant head roles",
            "Grade level & salary history tracking (StaffSalaryHistory, StaffGradeHistory)",
            "Designation assignment",
            "Avatar URL, location, and encoded ID support",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // 5.3 Recruitment
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("5.3 Recruitment Pipeline")],
          }),
          new Paragraph({
            children: [
              new TextRun("A full recruitment pipeline from job posting to onboarding:"),
            ],
          }),
          ...[
            "Jobs - Job postings with department, employment type, workplace type, salary range, locations, benefits",
            "Candidates - Applicant profiles with LinkedIn, portfolio, state/location",
            "JobApplications - Application tracking with CV upload, parsed content, scoring, stage history",
            "CandidateFile / CandidateDocument - File uploads with type categorization",
            "Keywords - Job-specific keyword matching for AI screening",
            "Interviews - Scheduling with type (PHONE/VIDEO/ONSITE), interviewers, outcomes",
            "Offers - Offer letter generation, acceptance tracking",
            "Onboarding - Status tracking with configurable tasks",
            "ApplicationStageHistory - Complete audit trail of status changes",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // 5.4 Leave Management
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("5.4 Leave Management")],
          }),
          ...[
            "LeavePolicy - Configurable policies with maxDays, carryOver, accrualRate, approval workflows",
            "LeaveType - Categorized leave types per policy (color-coded)",
            "LeaveRequest - Full leave application with dual approval (Manager + HR), handover support",
            "StaffLeaveBalance - Per-staff, per-type, per-year balances with carry-over tracking",
            "PublicHoliday - Company-specific holiday calendar",
            "LeaveBlackoutPeriods - Restricted date ranges",
            "Bulk upload support via leave_uploads for policies, types, holidays",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // 5.5 Payroll (Standard)
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("5.5 Payroll (Standard)")],
          }),
          ...[
            "Payroll - Comprehensive salary breakdown with 30+ fields including allowances, deductions, tax components",
            "Payslip - PDF payslip storage with file data and metadata",
            "PayrollUpload / StaffUpload - Bulk CSV/Excel processing with error tracking",
            "PayrollTemplate - Dynamic template system with customizable sections and fields",
            "PayrollTemplateField - Template field definitions with aliases, ordering, display rules",
            "PayrollData - Per-staff, per-period payroll data with flexible JSON structure",
            "Supports ISURF_STANDARD template type with walletPayment (OPay) and commercialPayment (Bank)",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // 5.6 Payroll Engine
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("5.6 Payroll Engine")],
          }),
          ...[
            "PayPeriod - Monthly pay cycles with validation windows (DRAFT → PAID lifecycle)",
            "EmployeeSalary - Detailed salary structure with all allowance components",
            "PayValidation - Staff payment validation with Yes/No status per period",
            "OvertimeEntry - Overtime hours tracking with multiplier calculation",
            "DeductionEntry - Variable deductions (UNION_DUES, COOPERATIVE, LOAN, SALARY_ADVANCE, OTHER)",
            "ComputedPayslip - Final computed payroll with full breakdown: earnings, statutory deductions, tax (PAYE), variable deductions, net salary",
            "Full Nigerian PAYE tax computation with consolidated relief, rent relief, pension, NHF, NHIS",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // 5.7 PHED Module
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("5.7 PHED Module (Port Harcourt Client-Specific Payroll)")],
          }),
          new Paragraph({
            children: [
              new TextRun("An independent payroll module specifically designed for the Port Harcourt Electricity Distribution (PHED) client with its own set of models parallel to the main payroll engine:"),
            ],
          }),
          ...[
            "PhedGrade - Grade level definitions (e.g., Officer IV → General Manager) for Regular & Contract categories",
            "PhedAllowanceTemplate - Default allowance templates per grade (17 allowance types: Housing, Transport, Furniture, Meal, Utility, Leave, Shift, Domestic, Hazard, Electricity, Discovery, Car, Entertainment, Data, Night, Arrears, Other)",
            "PhedRegion / PhedFeeder / PhedPayPoint - Hierarchical organizational structure",
            "PhedStaff - Independent staff records with banking, pension (RSA Pin, PFA), TIN, life assurance, rent relief",
            "PhedUnion - Union dues as percentage of gross salary",
            "PhedCooperative - Cooperative deductions per member",
            "PhedDeductionLiability - Custom per-employee fixed deductions",
            "PhedPayPeriod / PhedValidation / PhedOvertimeEntry - Monthly payroll processing",
            "PhedComputedPayroll - Full payroll computation with NTA 2025 tax rules, union/cooperative deductions, statutory deductions",
            "PhedBulkUpload - CSV upload tracking for staff, validation, and overtime data",
            "Separate tax engine (src/app/lib/phed/tax-engine.ts) with comprehensive Nigerian tax computation",
            "CSV parser (src/app/lib/phed/csv-parser.ts) for bulk data import",
            "Email templates (src/app/lib/phed/email.ts) and PDF payslip generation (phed/pdf-payslip.ts)",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // 5.8 Tax Management
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("5.8 Tax Management")],
          }),
          ...[
            "EmployeeTaxProfile - Per-staff tax info (state of residence, JTB TIN, PFA, verification status)",
            "TaxFilingSchedule - Per-period, per-state tax filing schedule with status tracking",
            "AnnualReturn - Annual tax returns per state (Form H1 support)",
            "TaxProfileUpload - Bulk tax profile import with success/failure tracking",
            "Full PAYE computation with graduated tax bands per Nigerian law",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // 5.9 Training & Certification
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("5.9 Training & Certification")],
          }),
          ...[
            "TrainingProgram - Full training programs with categories, levels, session types, assessment requirements",
            "TrainingSession - Individual sessions with date, trainer, capacity tracking",
            "TrainingMaterial - Learning materials (PDF, Video, Presentation, Document, External)",
            "Assessment - Quizzes with configurable passing scores, time limits, retake rules",
            "Question - Assessment questions (multiple-choice, true/false) with scoring",
            "AssessmentAttempt - Employee assessment attempts with scoring and review",
            "ParticipantProgress - Per-employee training progress tracking with certification status",
            "CertificationType / CertificationTemplate - Certification definitions",
            "CertificationRecord - Employee certification records with expiry tracking",
            "AssignmentRule - Automated training assignment rules (auto-assignment, triggers, recurring, expiry)",
            "RiskItem - Compliance risk tracking with severity levels",
            "TrainingAuditLog - Complete audit trail for all training actions",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // 5.10 Department Management
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("5.10 Department Management")],
          }),
          ...[
            "Department - Departments with code, business unit, head/assistant head, cost center, budget code",
            "DepartmentStaffHistory - Complete staff movement audit (transfers, position changes)",
            "DepartmentAuditLog - All department-level actions with user tracking",
            "Position capacity management and max headcount tracking",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // 5.11 Grade Levels & Allowances
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("5.11 Grade Levels, Benefits & Allowances")],
          }),
          ...[
            "GradeLevel - Grade definitions with rank, base pay, step progression, auto-progression support",
            "GradeStep - Step increments with percentage-based pay calculation per step",
            "Benefit - Benefit catalogue (label, type, description) linked to grades",
            "Designation - Job titles with code, grade assignment, department, staff count",
            "CompanyAllowanceRule - Company-specific allowance rules (PERCENTAGE/FIXED, taxable, approval requirements)",
            "GradeStepAllowance - Per-grade, per-step allowance definitions",
            "CompanySalaryFormula - Custom salary calculation formulas (base, allowances, deductions)",
            "GradeAllowanceTemplate - Default allowance templates per grade level",
            "StaffSalaryHistory / StaffGradeHistory - Comprehensive salary and grade change tracking",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // 5.12 Loans & Benefits
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("5.12 Loans & Benefits")],
          }),
          ...[
            "LoanRequest - Employee loan applications (PERSONAL, EMERGENCY, SALARY_ADVANCE) with approval workflow",
            "Loan tracking: approved amount, interest rate, monthly repayment, remaining balance, tenure",
            "BenefitRequest - Employee benefit requests with approval pipeline",
            "BenefitAllocation - Benefit allocations with amount tracking",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // 5.13 Attendance
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("5.13 Attendance Management")],
          }),
          ...[
            "Attendance - Daily attendance records with sign-in/sign-out times",
            "Support for multiple recording methods and status tracking",
            "Per-company, per-staff, per-date uniqueness constraint",
            "Recorded by tracking (user ID and role)",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // 5.14 Notifications & Email
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("5.14 Notifications & Emails")],
          }),
          ...[
            "Notification - In-app notifications with type, title, message, JSON data, read status",
            "EmailLog - Email delivery tracking (PAYSLIP_SELECTED, PAYSLIP_INITIAL types) with status (SENT/FAILED/PENDING)",
            "Email services: SendGrid, Mailgun.js, Nodemailer (multi-provider support)",
            "Notification helpers for leave management events",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // 5.15 AI
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("5.15 AI / CV Review & Company Settings")],
          }),
          ...[
            "AISettings - Per-company AI configuration (budget, cost per review, model selection, thresholds)",
            "AIUsageLog - Token usage and cost tracking per API call",
            "AI CV Review with automatic shortlisting (autoShortlistThreshold)",
            "Configurable for senior roles, technical roles, manager roles",
            "Supports OpenAI (GPT-3.5-turbo default) with cost alerts",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // ==================== SECTION 6: API ROUTES ====================
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("6. API Route Architecture")],
          }),
          new Paragraph({
            children: [
              new TextRun(
                "All API routes follow Next.js 14 App Router conventions under src/app/api/. Route groups include:"
              ),
            ],
          }),
          ...[
            "grade-levels/ - Full CRUD for grade levels with sub-routes: [id], create, steps, deactivate, activate, utilization, template/download, import/validate, import/confirm, stats, allowance-rules",
            "benefits/ - Benefit management endpoints",
            "Designation API - Designation management (documented in Designation API Doc.md)",
            "Recruitment endpoints - Jobs, candidates, applications, interviews, offers, onboarding",
            "Payroll endpoints - Payroll processing, payslip generation, template management",
            "PHED endpoints - Port Harcourt client-specific payroll operations",
            "Leave management endpoints - Policy, type, request, balance management",
            "Department endpoints - CRUD with head assignment and staff history",
            "Tax endpoints - Tax profiles, filing schedules, annual returns",
            "Training endpoints - Programs, sessions, materials, assessments, certifications",
            "Auth endpoints - Authentication, password reset, OTP verification",
            "Notification endpoints - Notification management",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // ==================== SECTION 7: SERVICES ====================
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("7. Key Services & Libraries")],
          }),
          ...[
            ["auth.ts", "JWT-based authentication with token generation and verification"],
            ["companyScope.ts", "Multi-tenant company scoping middleware"],
            ["db.ts / prisma.ts", "Database connection and Prisma client management"],
            ["prisma-utils.ts", "Prisma utility functions and helpers"],
            ["email.ts", "Email sending abstraction (SendGrid, Mailgun, Nodemailer)"],
            ["payroll-calculations.ts", "Core payroll computation logic"],
            ["payroll/generatePayslipPdf.ts", "Standard payslip PDF generation"],
            ["payroll/generateEnhancedPayslipPdf.ts", "Enhanced payslip PDF with more detail"],
            ["payroll/utils.ts / payslip-utils.ts", "Payroll utility functions"],
            ["phed/tax-engine.ts", "PHED-specific Nigerian tax computation engine"],
            ["phed/csv-parser.ts", "CSV file parsing for bulk PHED data"],
            ["phed/payroll-processor.ts", "PHED payroll processing pipeline"],
            ["phed/pdf-payslip.ts", "PHED payslip PDF generation"],
            ["phed/reports.ts / report-export.ts", "PHED reporting and data export"],
            ["leaves/balance-engine.ts", "Leave balance calculation engine"],
            ["services/grade-level.service.ts", "Grade level business logic"],
            ["services/allowance-calculator.service.ts", "Allowance calculation service"],
            ["services/staff-grade.service.ts", "Staff grade assignment and management"],
            ["aiCVReview.ts", "AI-powered CV review and scoring"],
            ["aiConfig.ts", "AI configuration management"],
            ["fileParser.ts", "File parsing (PDF, CSV, Excel, DOCX)"],
            ["file-storage.ts", "File storage abstraction"],
            ["rateLimiter.ts", "API rate limiting"],
            ["currency.ts", "Currency conversion, exchange rates"],
            ["modules.ts / module-access.ts", "Module-level access control"],
            ["keywordExtractor.ts", "NLP keyword extraction"],
            ["notifications/helpers.ts", "Notification creation and dispatch"],
          ].map(
            ([k, v]) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun({ text: k, bold: true }), new TextRun(` - ${v}`)],
              })
          ),

          // ==================== SECTION 8: SCRIPTS ====================
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("8. Scripts & Automation")],
          }),
          ...[
            ["seed.ts", "Database seeding script"],
            ["seed-leaves.ts", "Leave management seeding"],
            ["init-leave-balances.ts", "Initialize employee leave balances"],
            ["migrate-company-fields.ts", "Company data migration"],
            ["migrate-payslips-to-db.ts", "Payslip migration to database"],
            ["fix-payroll-upload-paths.ts", "Payroll upload path correction"],
            ["generate-leave-apply-docx.js", "Leave application document generation"],
            ["generate-leaves-api-docx.js", "Leaves API documentation generation"],
            ["generate-project-summary-docx.js", "This project summary document generator"],
            ["setup-windows.ps1", "Windows environment setup script"],
            ["regenerate-standard-payslip-sample.ts", "Standard payslip sample regeneration"],
            ["regenerate-enhanced-payslip-sample.ts", "Enhanced payslip sample regeneration"],
            ["test-enhanced-pdf-generator.ts", "PDF generation testing"],
            ["pdfkit-fix.js", "PDFKit compatibility fix"],
          ].map(
            ([k, v]) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun({ text: k, bold: true }), new TextRun(` - ${v}`)],
              })
          ),

          // ==================== SECTION 9: DEPLOYMENT ====================
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("9. Deployment & Infrastructure")],
          }),
          ...[
            "Docker: Containerized deployment via Dockerfile",
            "Render: Cloud deployment with render.yaml configuration",
            "Firebase: Firebase Functions (functions/src/) and Firebase Hosting (firebase.json)",
            "Database: PostgreSQL with Prisma adapter",
            "Build: Next.js build with Prisma generation and rimraf cleanup",
            "Post-install: Automatic Prisma client generation",
            "Testing: Jest test suite with unit, API, and security test categories",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          // ==================== SECTION 10: SUMMARY ====================
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("10. Summary & Key Metrics")],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("Project Statistics")],
          }),
          ...[
            ["Total Database Models", "60+"],
            ["Prisma Schema Lines", "2,855"],
            ["Major Modules", "14+"],
            ["API Route Files", "50+"],
            ["Service/Library Files", "40+"],
            ["Script Files", "15+"],
            ["Enum Types", "25"],
            ["Database Tables", "60+"],
            ["Core Dependencies", "35+"],
            ["Supported Payroll Types", "2 (Standard + PHED)"],
            ["Email Providers", "3 (SendGrid, Mailgun, Nodemailer)"],
            ["Supported File Formats", "CSV, XLSX, PDF, DOCX"],
          ].map(
            ([k, v]) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun({ text: k, bold: true }), new TextRun(`: ${v}`)],
              })
          ),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("Key Highlights")],
          }),
          ...[
            "Full HR lifecycle automation: Recruitment → Onboarding → Payroll → Offboarding",
            "Robust multi-tenant architecture with per-company data isolation",
            "Dual payroll engine: Standard ISURF payroll + PHED client-specific payroll",
            "Comprehensive Nigerian tax compliance (PAYE computation with NTA 2025 rules)",
            "Flexible payroll template system with dynamic field configuration",
            "AI-powered CV screening and candidate shortlisting with cost tracking",
            "Comprehensive leave management with dual approval workflow (Manager + HR)",
            "Training & certification module with automated assignment rules and expiry tracking",
            "Grade level system with step-based progression, allowance rules, and salary formulas",
            "Full audit trail across departments, training, and application stage history",
            "Bulk data import/export with detailed error reporting",
            "PDF payslip generation with customizable templates",
            "Multi-provider email delivery with delivery tracking",
          ].map(
            (t) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(t)],
              })
          ),

          new Paragraph({ spacing: { before: 600 } }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "--- End of Document ---",
                italics: true,
                color: "888888",
                size: 20,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const outputPath = path.join(__dirname, "..", "ISURFHR_Project_Summary.docx");
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  console.log(`Document generated: ${outputPath}`);
  console.log(`File size: ${(buffer.length / 1024).toFixed(1)} KB`);
}

function createModelTable() {
  const models = [
    ["AISettings", "Company AI configuration (budget, thresholds, model)"],
    ["AIUsageLog", "AI API usage and cost tracking"],
    ["AnnualReturn", "Annual tax returns per state"],
    ["ApplicationStageHistory", "Recruitment application status audit trail"],
    ["Assessment", "Training assessments/quizzes"],
    ["AssessmentAttempt", "Employee assessment submissions"],
    ["AssignmentRule", "Automated training assignment rules"],
    ["Attendance", "Daily attendance records"],
    ["Benefit", "Benefit catalogue linked to grades"],
    ["BenefitAllocation", "Benefit allocations to staff"],
    ["BenefitRequest", "Staff benefit requests"],
    ["Candidate", "Job candidate/applicant profiles"],
    ["CandidateDocument", "Candidate uploaded documents"],
    ["CandidateFile", "Candidate file storage (CV, cover letters)"],
    ["CertificationDocument", "Certification supporting documents"],
    ["CertificationRecord", "Employee certification records"],
    ["CertificationTemplate", "Certification document templates"],
    ["CertificationType", "Certification type definitions"],
    ["Company", "Central tenant entity (multi-tenancy)"],
    ["CompanyAllowanceRule", "Company-specific allowance rules"],
    ["CompanyExchangeRate", "Multi-currency exchange rates"],
    ["CompanyModuleAccess", "Per-company module enable/disable"],
    ["CompanyPayDate", "Company payment schedule dates"],
    ["CompanySalaryFormula", "Salary calculation formula definitions"],
    ["ComputedPayslip", "Final computed payroll per staff per period"],
    ["DeductionEntry", "Variable deduction entries"],
    ["Department", "Organizational departments"],
    ["DepartmentAuditLog", "Department action audit log"],
    ["DepartmentStaffHistory", "Staff movement/tranfer history"],
    ["Designation", "Job titles/designation linked to grades"],
    ["EmailLog", "Email delivery tracking"],
    ["EmployeeSalary", "Detailed employee salary structures"],
    ["EmployeeTaxProfile", "Per-employee tax information"],
    ["GradeAllowanceTemplate", "Default allowance templates per grade"],
    ["GradeLevel", "Grade level definitions"],
    ["GradeStep", "Steps within a grade level"],
    ["GradeStepAllowance", "Per-grade, per-step allowance amounts"],
    ["Interview", "Recruitment interviews"],
    ["Job", "Job postings"],
    ["JobApplication", "Job applications with status tracking"],
    ["Keyword", "Job-specific keywords for AI screening"],
    ["LeavePolicy", "Leave policy configurations"],
    ["LeaveRequest", "Leave applications"],
    ["LeaveType", "Leave type definitions"],
    ["leave_blackout_periods", "Restricted leave date ranges"],
    ["leave_uploads", "Bulk leave data uploads"],
    ["LoanRequest", "Employee loan applications"],
    ["Notification", "In-app notifications"],
    ["Offer", "Job offers"],
    ["Onboarding", "Employee onboarding tracking"],
    ["OnboardingTask", "Onboarding task checklist"],
    ["OvertimeEntry", "Overtime hours records"],
    ["ParticipantProgress", "Training participant progress"],
    ["PasswordReset", "OTP-based password reset"],
    ["PayPeriod", "Monthly pay cycle periods"],
    ["PayValidation", "Staff payment validation"],
    ["Payroll", "Payroll records (standard)"],
    ["PayrollData", "Flexible payroll data per staff/period"],
    ["PayrollTemplate", "Payroll template definitions"],
    ["PayrollTemplateField", "Template field definitions"],
    ["PayrollTemplateUpload", "Template data uploads"],
    ["PayrollUpload", "Payroll file uploads"],
    ["Payslip", "Generated payslip files"],
    ["PhedAllowanceTemplate", "PHED grade allowance templates"],
    ["PhedBulkUpload", "PHED bulk CSV upload tracking"],
    ["PhedComputedPayroll", "PHED computed payroll records"],
    ["PhedCooperative", "PHED cooperative definitions"],
    ["PhedDeductionLiability", "PHED custom deduction types"],
    ["PhedFeeder", "PHED organizational feeders"],
    ["PhedGrade", "PHED grade level definitions"],
    ["PhedOvertimeEntry", "PHED overtime records"],
    ["PhedPayPeriod", "PHED pay period cycles"],
    ["PhedPayPoint", "PHED pay point locations"],
    ["PhedRegion", "PHED geographical regions"],
    ["PhedStaff", "PHED employee records"],
    ["PhedStaffCooperative", "PHED staff-cooperative assignments"],
    ["PhedStaffDeductionLiability", "PHED staff deduction amounts"],
    ["PhedStaffUnion", "PHED staff-union assignments"],
    ["PhedUnion", "PHED union definitions"],
    ["PhedValidation", "PHED payment validation"],
    ["PlatformModule", "Platform-level module registry"],
    ["PublicHoliday", "Public holiday calendar"],
    ["Question", "Assessment questions"],
    ["RiskItem", "Compliance risk items"],
    ["StaffGradeHistory", "Staff grade change history"],
    ["StaffLeaveBalance", "Staff leave balance tracking"],
    ["StaffRecord", "Primary employee/user record"],
    ["StaffSalaryHistory", "Staff salary change history"],
    ["StaffUpload", "Staff data file uploads"],
    ["TaxFilingSchedule", "Tax filing schedule per period/state"],
    ["TaxProfileUpload", "Tax profile data uploads"],
    ["TrainingAuditLog", "Training action audit log"],
    ["TrainingMaterial", "Training learning materials"],
    ["TrainingProgram", "Training program definitions"],
    ["TrainingSession", "Training session instances"],
    ["UserCompany", "User-company workspace associations"],
  ];

  const rows = models.map(([name, desc]) => {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: 3500, type: WidthType.DXA },
          shading: { fill: "EBF5FB", type: ShadingType.CLEAR },
          children: [
            new Paragraph({
              children: [new TextRun({ text: name, bold: true, size: 18 })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 5500, type: WidthType.DXA },
          children: [
            new Paragraph({
              children: [new TextRun({ text: desc, size: 18 })],
            }),
          ],
        }),
      ],
    });
  });

  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            width: { size: 3500, type: WidthType.DXA },
            shading: { fill: "1B4F72", type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                children: [new TextRun({ text: "Model", bold: true, color: "FFFFFF", size: 20 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 5500, type: WidthType.DXA },
            shading: { fill: "1B4F72", type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                children: [new TextRun({ text: "Description", bold: true, color: "FFFFFF", size: 20 })],
              }),
            ],
          }),
        ],
      }),
      ...rows,
    ],
  });
}

generateDocument().catch(console.error);