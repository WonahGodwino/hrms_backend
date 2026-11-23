// Generates "247HR Module Completion Report.docx" in the repository root.
// Run from backend/: node scripts/generate-completion-report.cjs
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} = require('docx');

const OUT = path.resolve(__dirname, '..', '..', '247HR Module Completion Report.docx');

// ---------- helpers ----------
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 140 }, children: [new TextRun({ text: t, bold: true, size: 32 })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 110 }, children: [new TextRun({ text: t, bold: true, size: 26 })] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 180, after: 80 }, children: [new TextRun({ text: t, bold: true, size: 22 })] });
const P = (t, opts = {}) => new Paragraph({ spacing: { after: 90 }, children: [new TextRun({ text: t, size: 20, ...opts })] });
const B = (t) => new Paragraph({ spacing: { after: 60 }, bullet: { level: 0 }, children: [new TextRun({ text: t, size: 20 })] });
const B2 = (t) => new Paragraph({ spacing: { after: 50 }, bullet: { level: 1 }, children: [new TextRun({ text: t, size: 20 })] });
const KV = (k, v) => new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: k + ': ', bold: true, size: 20 }), new TextRun({ text: v, size: 20 })] });

const cellMargins = { top: 60, bottom: 60, left: 90, right: 90 };
const borderThin = { style: BorderStyle.SINGLE, size: 4, color: '9AA7B4' };
const tableBorders = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin, insideHorizontal: borderThin, insideVertical: borderThin };

function makeTable(headerCells, rows, widths) {
  const head = new TableRow({
    tableHeader: true,
    children: headerCells.map((h, i) => new TableCell({
      shading: { type: ShadingType.CLEAR, fill: '1F3864' },
      margins: cellMargins,
      width: widths ? { size: widths[i], type: WidthType.PERCENTAGE } : undefined,
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 19 })] })],
    })),
  });
  const body = rows.map((r, ri) => new TableRow({
    children: r.map((c, i) => new TableCell({
      shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: 'EEF2F8' } : undefined,
      margins: cellMargins,
      width: widths ? { size: widths[i], type: WidthType.PERCENTAGE } : undefined,
      children: [new Paragraph({ children: [new TextRun({ text: String(c), size: 19 })] })],
    })),
  }));
  return new Table({ borders: tableBorders, width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...body] });
}

const GAP = () => new Paragraph({ children: [], spacing: { after: 60 } });

// ---------- module data ----------
// fe/be/in = pre-penalty scores; penalty = dead-code penalty points applied to each component before holistic.
const MODULES = [
  {
    name: 'Core Setup', weight: 11, fe: 90, be: 92, integ: 88, penalty: 2,
    hol: 88,
    items: 'Companies; Departments; Business Units; Designations; Grade Levels; Allowance Rules; Staff Management (link); Payroll Template; plus routed extras (Company Profile, Register Company, Assign Staff, Currency, Pay Dates, Template create/edit).',
    evidence: [
      'CONFIRMED: every sidebar href in this group has a working module-gated route in App.jsx (/companies, /departments, /business-units, /designations, /grade-levels, /grade-levels/allowance-rules, /templates, /templates/create, /templates/edit/:id).',
      'CONFIRMED: AllowanceRulesPage is wired end to end — GradeLevelService getAllowanceRules/updateAllowanceRules hit backend /api/grade-levels/allowance-rules (GET+POST handlers present).',
      'CONFIRMED: CompanyService getCompany/updateCompany target /api/companies/:id which exists and was actively modified in this working tree; register-company posts to /api/auth/companies/register.',
      'CONFIRMED: BusinessUnitService CRUD, org chart, import validate/confirm, stats and template download all map to existing /api/business-units routes.',
      'CONFIRMED: Designations CRUD/import/template/stats routes exist and the Designations page uses them.',
      'DISCONNECTED: Departments > Staff Roster "remove staff" action (pages/core-setup/departments/StaffRosterTab.jsx line 210) calls POST /api/departments/{id}/staff/{staffId}/remove; the backend only exposes POST /api/departments/{staffId}/remove (single path parameter, treats the id as the staffId). The two-level path the frontend sends matches no backend route, so the action fails at runtime.',
    ],
    dead: [
      'CompanyService.js lines 5–20: legacy /company, /company/{id} GET/PUT/DELETE functions kept as commented-out blocks — dead code for endpoints that no longer exist.',
      'DepartmentService.js peekEmployee() targets GET /api/v1/employees/{staffId}/peek; the backend route lives at /api/employees/{staffId}/peek (no /v1 prefix). The function is also unused by any page, so it is doubly dead.',
      'Backend /api/admin/dashboard/cards, /stats (partially), /staffsearch: /admin/dashboard/cards and /admin/dashboard/staffsearch have no frontend caller (stats is used by SystemDashboard via DashboardService).',
    ],
    gaps: [
      'Repair the department staff-remove contract: either change the frontend to POST /departments/{staffId}/remove or add the nested backend route. Until then the Staff Roster remove workflow is broken (costs the integration points reflected in the score).',
      'Delete the commented-out /company legacy block and the mis-routed peekEmployee() helper, or re-point peekEmployee at /employees/{staffId}/peek and use it.',
    ],
  },
  {
    name: 'Staff Management', weight: 11, fe: 92, be: 90, integ: 88, penalty: 1,
    hol: 89,
    items: 'Staff Management (roster, invite, upload, bulk edit, transfer, block/device controls); Upload History; Re-Onboard; Employee Profile 360; Staff Insights (reporting group item keyed to this module).',
    evidence: [
      'CONFIRMED: /staff-management, /staff-management/history, /staff-management/re-onboard, /staff-management/:id all routed and role-guarded (ADMIN/HR).',
      'CONFIRMED: StaffManagement.jsx uses getStaffRecords -> /api/staff/records (route exists), bulk-edit upload/status/download-failed/download-original family exists.',
      'CONFIRMED: Employee Profile 360 aggregates staff detail (/admin/staff/edit/{id}), employment history (/staff/{id}/employment-history), loans & benefits (/staff/{id}/loans-benefits), attendance (/attendance/staff), leave balances, payslips, compensation and device activity log — all verified present in the backend, making this the strongest cross-module consumer in the app.',
      'CONFIRMED: device management (this working tree\'s newest feature) is wired: /staff/{id}/devices, /staff/{id}/devices/{deviceId}, /admin/staff/{id}/block, /unblock, /activity-log all exist and are used by StaffManagement/StaffViewModal/DeviceList.',
      'CONFIRMED: bulk transfer is functional: StaffTransferService posts /api/staff/transfer with dryRun true/false; BulkTransferStaffModal is reachable from the roster.',
      'CONFIRMED: Staff Insights page consumes /admin/dashboard/reporting/staff-insights and its export, export/departments and export/executive-summary routes, all present.',
    ],
    dead: [
      'Backend /api/staff/transfer/search exists but no frontend caller uses it (the modal resolves staff through /staff/records search instead) — unused endpoint.',
      'Backend /api/departments/staff/update/{id}/position has no frontend caller — unused endpoint (position edits flow through /admin/staff/edit/{id}).',
    ],
    gaps: [
      'Delete or wire /api/staff/transfer/search and /api/departments/staff/update/{id}/position. Both are small, but per the scoring rules unused endpoints reduce backend completeness.',
    ],
  },
  {
    name: 'Finance & Payroll', weight: 15, fe: 82, be: 88, integ: 80, penalty: 4,
    hol: 80,
    items: 'My Payslips; Company Payslips; Payroll Dashboard; Staff Compensation; Payroll Generation; Account Validator; plus routed non-sidebar screens (Payroll Templates, Process Payroll, Payroll History, Payroll Settings, Generated Payslips, View Payslip, Email Delivery, Positions/Deductions/Allowances, Performance & Appraisals) and the finance Reporting screens.',
    evidence: [
      'CONFIRMED: Payroll Generation is complete and integrated — generate, history, run detail, row edit, recompute, exclude/include, approve, reopen, upload override, download and delete all map to /api/payroll/generate family handlers; PayrollGenerateReview consumes them.',
      'CONFIRMED: Staff Compensation Upload is fully wired (template download, upload, overview, history, history download under /api/staff/compensation/*).',
      'CONFIRMED: Account Validator uses /api/payroll-verifier/banks, /verify-single, NDJSON streaming /upload and /validate-staff — all present.',
      'CONFIRMED: Company payslips, duplicate detection (/api/payslips/duplicates GET/DELETE), email delivery, bulk-send pending/preview/status and /api/payroll/resend-email + payslip-email-logs are present and used.',
      'CONFIRMED: Finance Report (admin) consumes /admin/dashboard/reporting/salary-summary and exports full/bank-schedule/statutory/executive-summary — all backend routes exist.',
      'DISCONNECTED: /process-payroll route renders ProcessPayroll.jsx, which fetches GET /api/payroll/data/{fileId}. No backend route /api/payroll/data/[id] exists anywhere — the screen can only fail at runtime.',
      'DISCONNECTED: ViewPayslip.jsx and PayrollSuccessModal.jsx navigate to /admin/generated-payslips and /admin/payroll-dashboard. App.jsx defines /generated-payslips and /payroll-dashboard (no /admin prefix), so both navigation actions dead-end on the 404 screen.',
      'PARTIAL: PayrollTemplates.jsx (route /payroll-templates) still contains "TODO: Replace with real API call" — part of that screen is placeholder logic.',
      'PLACEHOLDER: /positions-deductions-allowances renders a 3-line stub ("Positions, Deductions and Allowances Page") and /performance-appraisals renders a 3-line stub. Both are reachable routes with no functionality and no backend.',
    ],
    dead: [
      'ProcessPayroll.jsx + PayrollService.getPayrollData(): frontend screen and service function pointing at a backend route that does not exist (dead path kept mounted).',
      'Routes /payroll-templates, /process-payroll, /payroll-history, /payroll-settings, /positions-deductions-allowances, /performance-appraisals are mounted but absent from the sidebar — orphaned workflow entries; two of them are literal stubs.',
      'Backend /api/payslips/duplicates/batch-check and /check-staff have no frontend caller — unused endpoints next to the used /duplicates pair.',
      'Hard-coded /admin/... navigation targets in ViewPayslip.jsx and PayrollSuccessModal.jsx (dead links to 404).',
    ],
    gaps: [
      'Implement GET /api/payroll/data/{fileId} (or re-point ProcessPayroll at the upload/status payload) and either finish or remove /process-payroll.',
      'Fix navigation targets to /generated-payslips and /payroll-dashboard.',
      'Complete or delete the two stub routes (Positions/Deductions/Allowances, Performance & Appraisals) and the PayrollTemplates TODO path.',
      'Wire or remove the two unused payslip duplicate-check endpoints.',
    ],
  },
  {
    name: 'Leave', weight: 8, fe: 80, be: 82, integ: 78, penalty: 4,
    hol: 76,
    items: 'Leave Dashboard; Leave Policy; Manager Assignment; plus routed non-sidebar screens (Leave History, Leave Approvers, Import Leave Records, Leave Applications) and Leave Reporting.',
    evidence: [
      'CONFIRMED: Leave Dashboard is integrated: getMyLeaves/getAdminLeaveRequests/getManagerRequest hit /api/leaves/my-leaves, /api/leaves/admin, /api/leaves; manager approve/reject uses PATCH /api/leaves/{id}/manager-approve; HR approve/reject uses PATCH /api/leaves/{id}/hr-approve (both handlers implement approve and reject actions).',
      'CONFIRMED: leave balances (/api/leaves/balances), types, apply (multipart), details, attachment download, upload history and failed-rows download all exist and are used by the dashboard/policy screens.',
      'CONFIRMED: Manager assignment posts /api/staff/assign-manager (route exists); leave reporting consumes /admin/dashboard/reporting/leave and /export (both exist).',
      'DISCONNECTED: leaveDetailsModal.jsx line 428 calls cancelLeaveRequest -> POST /api/leaves/{id}/cancel. No backend route /api/leaves/[id]/cancel exists; the backend only exposes hr-approve, manager-approve and attachment under [id]. The staff-facing "cancel my leave" action always fails.',
      'DISCONNECTED: leaveService.rejectLeaveRequest() targets POST /api/leaves/{id}/reject — no such route. Rejection exists only as an action inside hr-approve/manager-approve. The standalone function is unused by pages (only imported), so it is dead rather than user-facing.',
      'PLACEHOLDER: /leave-applications renders the 3-line stub "My Leave Applications Page" — reachable by URL, non-functional.',
      'PARTIAL: leaveSettingsUploadModal.jsx and leaveUploadDetailsModal.jsx contain TODO markers on parts of the upload flow.',
    ],
    dead: [
      'Backend contract hole where a used frontend action points (leave cancel) — counted as a broken workflow, the largest penalty contributor.',
      'leaveService.rejectLeaveRequest() — unused service function targeting a non-existent endpoint.',
      'LeaveApplications stub route mounted outside the sidebar.',
    ],
    gaps: [
      'Add POST /api/leaves/{id}/cancel (with ownership + status guard) or rewire the modal to the existing approve endpoints; today the cancel workflow is broken.',
      'Remove rejectLeaveRequest() or align it with hr-approve/manager-approve.',
      'Implement or remove the /leave-applications stub and resolve the two upload-modal TODOs.',
    ],
  },
  {
    name: 'Attendance', weight: 8, fe: 92, be: 92, integ: 88, penalty: 0,
    hol: 91,
    items: 'Attendance Dashboard (admin); My Attendance (staff); Attendance Reporting.',
    evidence: [
      'CONFIRMED: AttendanceDashboard consumes /api/attendance/daily (GET+POST), /weekly, /monthly — all handlers present; view switching and error/empty states are handled in the page.',
      'CONFIRMED: StaffAttendanceDashboard consumes /api/attendance/staff (GET) with month navigation — present and role-guarded to STAFF.',
      'CONFIRMED: Attendance Reporting consumes /admin/dashboard/reporting/attendance and /admin/dashboard/reporting/attendance/export — both exist.',
      'CONFIRMED: Employee Profile 360 reuses the same /attendance/staff feed, so attendance data is consistently shared across modules.',
    ],
    dead: [
      'None material. AttendanceService contains a commented-out legacy block duplicating the live functions (cosmetic only).',
    ],
    gaps: [
      'No functional gap identified in this review; the module is the cleanest full-stack slice in the repository.',
    ],
  },
  {
    name: 'Recruitment', weight: 10, fe: 88, be: 90, integ: 86, penalty: 2,
    hol: 86,
    items: 'Pipelines; Shortlisted; Assessment Plans; Assessments; Interviews; Offers; Offer Letter Settings; Talent Pool; plus routed screens (job create/edit, applicant list/detail, assessments queue, offer templates builder, external onboarding) and public careers/offer-response pages.',
    evidence: [
      'CONFIRMED: jobs CRUD + public apply/view/detail, shortlist, assessment plans (rounds, publish, archive, stats, instances), candidate scheduling/evaluation/advance/reject/proceed-to-offer, interviewers and my-interviews all map to existing /api/recruitment routes.',
      'CONFIRMED: offers family is broad and used — generate, batch dispatch, approvals, respond (public token), letter download, executed contract, initiate-onboarding.',
      'CONFIRMED: public offer-response page uses GET/POST /api/recruitment/offers/public/respond and GET/POST /api/recruitment/offers/public/documents (POST handler verified) — the candidate document-upload loop is complete.',
      'CONFIRMED: ConfigureRoundDrawer posts the interview guide directly to /api/recruitment/assessments/guide/upload (route exists).',
      'CONFIRMED: external onboarding dashboard uses the /api/recruitment/onboarding family (list, tasks, remind, send-welcome, cancel, complete) — all present.',
      'PARTIAL: /internal-vacancies renders a 3-line stub ("Internal Vacancies Page") though it is routed for STAFF; JobDetails.jsx links to /admin/vacancies which is not a registered route (404).',
      'PARTIAL: a small number of backend endpoints have no frontend caller (see dead list) — mostly reporting/duplicate variants.',
    ],
    dead: [
      'Backend /api/recruitment/assessments/report, /api/recruitment/selection/report, /api/recruitment/offers/template/download: implemented but never called by the frontend — unused endpoints.',
      'InternalVacancies.jsx stub page; /admin/vacancies navigation target in JobDetails.jsx points at a non-existent route.',
      'Talent-pool unsubscribe is only reachable from outbound email links (frontend never calls it directly) — kept out of the penalty but noted as email-only surface.',
    ],
    gaps: [
      'Implement the Internal Vacancies screen or remove the route and the /admin/vacancies link.',
      'Delete the three unused report/template endpoints or surface them in the UI.',
    ],
  },
  {
    name: 'Onboarding', weight: 6, fe: 78, be: 85, integ: 75, penalty: 3,
    hol: 77,
    items: 'Command Center; New Hires; My Onboarding (staff).',
    evidence: [
      'CONFIRMED: OnboardingCommandCenter consumes the /api/recruitment/onboarding family (list, send-welcome, remind, handoff update, cancel, complete) — all backend handlers verified.',
      'CONFIRMED: My Onboarding (staff) reads and uploads through /api/staff/onboarding-documents (GET list/POST multipart/[id]/download) — all present; document review/approve/reject happens from the HR side of the same family.',
      'CONFIRMED: offer execution with initiateOnboarding=true creates the Onboarding record (backend), which then appears in the command center — the recruitment→onboarding handoff is real.',
      'DISCONNECTED (structural): App.jsx mounts /onboarding (New Hires) inside the RECRUITMENT module gate while /onboarding-center is inside ONBOARDING. A company that disables RECRUITMENT but enables ONBOARDING hides "New Hires" — the sidebar promises it under Onboarding.',
      'PARTIAL: the module has no dedicated backend namespace of its own; it entirely borrows /recruitment/onboarding and /staff/onboarding-documents. Functionally complete, but module-level enablement (ONBOARDING key) does not gate the data it serves.',
    ],
    dead: [
      'No dead screens or unused endpoints found inside the module itself.',
    ],
    gaps: [
      'Move /onboarding under the ONBOARDING module gate (or gate the underlying data routes by the ONBOARDING module key) so sidebar promises and access control agree.',
    ],
  },
  {
    name: 'Training & Certifications', weight: 8, fe: 70, be: 72, integ: 68, penalty: 6,
    hol: 64,
    items: 'Training Dashboard; Programs; Assignment; Calendar; Assessment; Analytics; Rules Activity Log; Training Setup; My Trainings; Assign Training; Team Reports; Certifications Dashboard; Documents Management; Compliance; Audit Trail; Certification Templates; Certification Setup; My Certifications; Assign Certifications.',
    evidence: [
      'CONFIRMED: programs CRUD, sessions, participants, assignment rules (incl. expiry rules served through /api/assignment-rules), notifications rules, compliance rules, activity log and team overview (/api/training-programs/team-overview) and my-progress are all backed by existing routes and used by their pages.',
      'CONFIRMED: My Trainings uses /api/training-programs/my-progress; My Certifications uses /api/certifications + document download; certifications audit/documents/reports/export families exist (41 route files under /api/certifications).',
      'DISCONNECTED: QuestionBank page calls GET/POST/DELETE /api/question-bank/questions and POST /api/question-bank/questions/import — no /api/question-bank namespace exists in the backend. The page handles the failure with a "not connected yet" warning, but the whole standalone question-bank workflow is dead.',
      'DISCONNECTED: AttemptReview.jsx line 555 calls reassignAssessmentAttempt -> POST /api/attempts/{id}/reassign. No such route exists under /api/attempts (which has review/submit/retake/reset/flag/finalize/export). A user-visible action fails.',
      'DISCONNECTED: publishCertificationTemplate (used by TemplateLibrary and CertificationTemplateBuilder) posts /api/certification-templates/{id}/publish; the backend [id] route only implements GET/PUT/PATCH/DELETE — publish always falls into the "not connected yet" branch.',
      'DISCONNECTED: getEmployees() (used by CertificationsModule for issuance) calls GET /api/employees; only /api/employees/{staffId}/peek exists — the issuance modal\'s employee lookup shows the failure toast.',
      'DISCONNECTED: exports/actions without backend: /analytics/training/trends/export, /analytics/training/dashboard/export, /analytics/skills/export, /analytics/certifications/risk/export, /analytics/certifications/compliance/reminders, /compliance/batch-process, and the risk item actions assign/remediate/dismiss/restrict-access/reminders (backend /api/analytics/certifications/risk and /api/analytics/risk-items only implement GET). Every affected screen degrades to a warning banner.',
      'PLACEHOLDER: TrainingDetails.jsx tabs "Participants / Training Materials / Assessments / Analytics" render literal "coming soon" boxes; AIInsightsRecommendations.jsx ships a hard-coded "Coming soon" recommendation card; TrainingCalendarPage has a "Coming soon" action; CertificationComplianceDashboard has a disabled "Columns coming soon" control.',
      'PARTIAL: ExpiryAndReassignment.jsx comments "Replace this with backend simulation when POST /expiry-rules/simulate is implemented" — the backend route /api/expiry-rules/simulate actually exists; the page simply never calls it (implemented-but-disconnected backend).',
    ],
    dead: [
      'Entire /api/question-bank frontend contract (4 calls) with no backend — dead workflow kept mounted.',
      'POST /api/attempts/{id}/reassign call — targets nothing.',
      'Six analytics export/action endpoints called by the UI with no backend handler.',
      'Backend /api/expiry-rules/simulate and /api/analytics/certifications/departments implemented but never called.',
      'Mock-data fallbacks remain throughout TrainingService/CertificationService (gated behind VITE_USE_MOCK_* flags; real APIs are the default) — latent dead code.',
    ],
    gaps: [
      'Implement the question-bank namespace or remove the QuestionBank page\'s standalone mode.',
      'Add attempts/{id}/reassign, certification-template publish, and an /employees list endpoint (or reuse /staff/records) — these break visible actions today.',
      'Add the missing analytics export/action handlers or remove the buttons.',
      'Replace the four "coming soon" placeholder surfaces with functional content or remove the tabs.',
      'Call /api/expiry-rules/simulate from ExpiryAndReassignment and delete unused analytics endpoints.',
    ],
  },
  {
    name: 'Offer Letters', weight: 6, fe: 88, be: 90, integ: 86, penalty: 1,
    hol: 87,
    items: 'All Letters; Create Letter; Document Templates; Email Templates; Email Mailbox; Email Configuration. (The "Imported Inbox Triage" item is SUPER_ADMIN-only and excluded from scoring.)',
    evidence: [
      'CONFIRMED: the whole surface is served by a complete /api/offer-letters family: letters CRUD, DOCX-templated document generation, per-letter and bulk email send, email templates, IMAP inbox poll/start/stop/status, unmatched-reply link, sender identity, mail config, bulk-create/bulk-edit/bulk-delete with job status and failure reports.',
      'CONFIRMED: OfferLettersDashboard, CreateOfferLetter, OfferLetterInboxPage and the mail-config page all import from OfferLetterService whose URLs match the backend family one-for-one.',
      'CONFIRMED: OfferLetterSettings (Core Setup screen) uses /api/admin/settings/offer-letter and the signature upload/delete route — both exist.',
      'CONFIRMED: executed-contract / onboarding handoff links into the Recruitment module (offer execute -> Onboarding record) and that flow is exercised by the public response page.',
    ],
    dead: [
      'Minor: a handful of bulk-job endpoints (pending/status/failure-report) are used only by the dashboard poller; no other dead surface found.',
    ],
    gaps: [
      'No user-facing gap beyond routine hardening; the penalty reflects small unused surface area only.',
    ],
  },
  {
    name: 'PHED Payroll Engine', weight: 8, fe: 85, be: 92, integ: 85, penalty: 2,
    hol: 85,
    items: 'Configuration; Staff; Tax Profiles; PHED Approval Workflow (access roles); Pay Periods (+workflow detail); My Approval Queue; Approval Tracker; Memo Archive; My Payslips; IAD Page; Treasury (Bank Page, Pension, PAYE, NSITF/ITF/NHF, Unions & Cooperatives, Liabilities); Cost Centre Report; Tax PAYE Schedule.',
    evidence: [
      'CONFIRMED: pay-period lifecycle is fully wired — open/close validation, compute, approve, revert, employees, overtime (GET/template/upload/PATCH), validations (GET/template/upload/PUT/DELETE), summary (json/xlsx/pdf), payslip send and per-staff payslip download.',
      'CONFIRMED: approval memos family (list, create, detail, recommend, approve, final-approve, flag, tax-audit, pdf) backs My Approval Queue, Approval Tracker and Memo Archive; access-roles CRUD backs the PHED Approval Workflow screen.',
      'CONFIRMED: Module 13 role pages are report-driven via a shared ReportTable: bank-schedule, pension, paye, nsitf, itf, nhf, union-cooperative-deductions, liabilities, cost-centre and the four iad-* reports — every reportType used by a page exists under /api/phed/pay-periods/[id]/reports.',
      'CONFIRMED: my-payslips (list + per-period) and tax-profiles (GET/POST upload/PUT) are present and used.',
      'PARTIAL: three template endpoints are implemented but bypassed by the UI — /pay-periods/{id}/issue-template, /template, /upload-template are never called; the workflow uses validations/template and overtime/template instead.',
      'PARTIAL: /api/phed/reports/aggregate (company-level aggregate) is never called; the UI calls the per-period /pay-periods/{id}/reports/aggregate.',
    ],
    dead: [
      'Backend /api/phed/pay-periods/[id]/issue-template, /[id]/template, /[id]/upload-template — unused, superseded by the validations/overtime template routes (superseded duplicate implementation).',
      'Backend /api/phed/reports/aggregate — unused duplicate of the per-period aggregate report.',
      'Feeders/regions/pay-points config routes are used by the Configuration screen (verified via PhedService imports); cooperatives/deduction-liabilities upload members flows are wired through Treasury config — no additional dead endpoints identified.',
    ],
    gaps: [
      'Delete the three superseded pay-period template routes and the company-level aggregate duplicate, or rewire the UI to them — per the rules, superseded duplicates reduce backend completeness.',
    ],
  },
  {
    name: 'Loans & Benefits', weight: 4, fe: 68, be: 76, integ: 62, penalty: 8,
    hol: 61,
    items: 'Dashboard; My Loans; Apply for Loan; Guarantor Dashboard; Benefits Dashboard; Available Benefits; Claims & Reimbursements; Approvals; Financial Dashboard; Loan Management; Loan Configuration; Benefit Configuration; Benefit Allocation; plus routed Repayment Schedule.',
    evidence: [
      'CONFIRMED: the rebuilt backend surface (33 route files under /api/staff-loans-benefits) matches LoansBenefitsService one-for-one — policies (loans/benefits CRUD+publish+archive), loan-requests (create/list/detail/installments/simulate), approve/reject/disburse/force-recovery, guarantor search/dashboard/authenticated respond, benefit-requests approve/reject, benefit-allocations (single+bulk), benefit-claims (list/detail/approve/reject), unified approvals feed.',
      'CONFIRMED: the new pages (Dashboard, MyLoans, ApplyForLoan, GuarantorDashboard, BenefitsDashboard, AvailableBenefits, ClaimsReimbursements, ApprovalsDashboard, AdminFinancialDashboard, LoanManagementAdmin, LoanConfiguration, BenefitConfiguration, BenefitAllocation) import only from LoansBenefitsService; no dangling references to the deleted legacy pages remain (verified by repo-wide search).',
      'CONFIRMED: ApprovalsDashboard provides a working approve/reject loop for loan requests, benefit requests and claims against the unified /approvals feed; staff-side request/claim submission and guarantor (in-app) response are wired.',
      'DISCONNECTED (critical): the external guarantor journey is broken end to end. backend/src/app/lib/email.ts line 780 emails the link {FRONTEND_URL}/guarantor-response?token=..., but the /guarantor-response route in App.jsx is commented out, so every emailed guarantor link lands on the 404 page. The token-based page (GuarantorResponsePage.jsx) and its two token endpoints (/guarantor/respond GET+POST) exist and are implemented — they are just unreachable.',
      'DISCONNECTED: POST /api/staff-loans-benefits/benefit-claims/{id}/pay exists but no frontend code calls payClaim() — paid-out claims can never be marked paid from the UI.',
      'DISCONNECTED: POST /api/staff-loans-benefits/loan-requests/{id}/cancel exists but cancelLoanRequest() is never used — borrowers cannot withdraw an application.',
      'DISCONNECTED: GET /api/staff-loans-benefits/reports exists but getLoansBenefitsReport() is never used — the financial dashboard renders only from /dashboard.',
      'PARTIAL: the working tree carries a Prisma rebuild migration (20260911120000_rebuild_loans_benefits) and schema changes that have not been applied in this checkout; per the review constraints no migration was run, so persistence behaviour is verified statically (models + route usage) rather than executed.',
    ],
    dead: [
      'Deleted-with-replacement churn visible in git: backend _helpers.ts, loan-requests/{repayments,terms,guarantor}, my-loans, policies/{template,upload,validate-guarantor}, requests/[id]/decision, lib/benefits/eligibility.ts; frontend pages (AllStaffLoansPage, BenefitsCatalogPage, LoanRequestsPage, LoanTermsPage, MyLoansPage, PolicySetupPage, StaffLoansBenefitsIndex, useLoanEligibility, useModuleData, formatRules, index, Card, ReportModal). Removal is clean (no dangling imports) but is direct evidence of an in-flight rebuild.',
      'Three implemented-but-uncalled endpoints listed above (claims pay, loan cancel, reports).',
      'Commented-out /guarantor-response route in App.jsx while the page, service and endpoints all exist.',
    ],
    gaps: [
      'Re-enable the /guarantor-response route (uncomment) and re-test the emailed token loop — highest-value fix in the module.',
      'Surface claim payout (payClaim), borrower cancel and the reports feed in LoanManagementAdmin/ClaimsReimbursements/AdminFinancialDashboard.',
      'Apply and verify the rebuild migration in a development database, then confirm role-scoped visibility for STAFF approvers.',
    ],
  },
  {
    name: 'Offboarding', weight: 2, fe: 68, be: 78, integ: 66, penalty: 6,
    hol: 65,
    items: 'OffBoarding Dashboard (HR); Offboarding Center (staff).',
    evidence: [
      'CONFIRMED: HR dashboard is integrated — getOffboardings (/api/offboarding), reviewResignation (PATCH /{id}/review), approveOffboarding (PATCH /{id}/approve), initiateTermination (POST /termination) all exist and are used.',
      'DISCONNECTED (critical): the staff self-service screen calls getMyOffboardings() -> GET /api/offboarding/my, but the backend directory backend/src/app/api/offboarding/my/ contains a file named routes.ts instead of route.ts. Next.js does not serve routes.ts, so the endpoint 404s and the staff Offboarding Center cannot load its records (the duplicate logic in /offboarding/staff confirms the intended behaviour exists but is shadowed by the filename bug).',
      'PLACEHOLDER: /exit-interview is mounted and renders the 3-line stub "Exit Interview Page"; the App.jsx block for /offboarding/create, /offboarding/:id and /offboarding/staff/:id is commented out, so HR cannot open a per-case detail view from the dashboard.',
      'PARTIAL: handover upload (PATCH /{id}/handover) is used by the staff center — but because /offboarding/my 404s first, the staff journey stalls before handover in practice.',
    ],
    dead: [
      'offboarding/my/routes.ts — dead-by-filename endpoint (never served).',
      'Commented-out route block (create/details/staff view) and the ExitInterview stub — exposed intent with no implementation.',
    ],
    gaps: [
      'Rename backend/src/app/api/offboarding/my/routes.ts to route.ts — one-line fix that restores the staff offboarding journey.',
      'Implement or remove the create/detail/exit-interview routes and the ExitInterview stub.',
    ],
  },
  {
    name: 'Meetings', weight: 2, fe: 92, be: 92, integ: 88, penalty: 0,
    hol: 91,
    items: 'Video Meetings (dashboard + full-screen room).',
    evidence: [
      'CONFIRMED: MeetingsDashboard uses getMeetings/createMeeting/updateMeeting/recording download; MeetingRoom uses join token, end, moderate, admit and recording start/stop — the backend /api/meetings and /api/meetings/[id]/{token,end,moderate,recording,admit} routes all implement these, plus a LiveKit webhook.',
      'CONFIRMED: /meetings/:id is reachable for staff via session and for guests via ?token= (MeetingRoute), and the route is module-gated by MEETINGS.',
    ],
    dead: [
      'None found in the module surface.',
    ],
    gaps: [
      'Guest participation still requires a token issued by an authenticated organiser; there is no self-service external-participant model. Scored as a product gap already acknowledged in prior reports, not as dead code (no penalty).',
    ],
  },
  {
    name: 'Task Management', weight: 1, fe: 5, be: 0, integ: 0, penalty: 2,
    hol: 1,
    items: 'Task Dashboard; My Assigned Tasks.',
    evidence: [
      'DEAD: the sidebar item "Task Dashboard" links to /tasks-dashboard. No route with that path exists in App.jsx — every user who clicks it lands on the 404 screen.',
      'PLACEHOLDER: /assigned-tasks (the routed item) renders AssignedTasks.jsx, a hard-coded 3-row mock array with "Mark Complete" buttons that have no handlers and no service calls.',
      'DEAD: TaskService.js defines a full CRUD contract (GET/POST/PUT/DELETE /api/task, /api/task/statistics) but no /api/task namespace exists in the backend — the service is 100% disconnected.',
      'DEAD: pages/admin/tasks/StaffTasksHub.jsx, ManagerTasksHub.jsx, TaskDashboard.jsx and components/tasks/TaskFormModal.jsx exist but are imported by no route; they also fetch /api/tasks and /api/tasks/update, which do not exist.',
    ],
    dead: [
      'Entire module surface: one dead sidebar link, one mock screen, one orphaned service, four orphaned screens/components, zero backend.',
    ],
    gaps: [
      'Decide the module\'s fate: implement /tasks-dashboard + a /api/task backend and wire AssignedTasks to it, or remove the sidebar group, the route and the orphaned files. Current state is 0% functional.',
    ],
  },
];

const clamp = (v) => Math.max(0, Math.min(100, v));
function penalized(m) { return { fe: clamp(m.fe - m.penalty), be: clamp(m.be - m.penalty), integ: clamp(m.integ - m.penalty) }; }

// ---------- overall numbers ----------
let wFE = 0, wBE = 0, wIN = 0, wHOL = 0, wSum = 0;
for (const m of MODULES) {
  const p = penalized(m);
  wFE += p.fe * m.weight; wBE += p.be * m.weight; wIN += p.integ * m.weight; wHOL += m.hol * m.weight; wSum += m.weight;
}
const overall = {
  fe: Math.round(wFE / wSum),
  be: Math.round(wBE / wSum),
  integ: Math.round(wIN / wSum),
  hol: Math.round(wHOL / wSum),
};

// ---------- document ----------
const children = [];

children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: '247HR', bold: true, size: 52, color: '1F3864' })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'Module Completion Report — Deep Frontend / Backend / Integration Assessment', size: 26, bold: true })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 250 }, children: [new TextRun({ text: 'Reviewed and replaced: 11 September 2026 · Scope: all non-Super Admin sidebar modules · Evidence basis: static cross-tracing of Sidebar.jsx → App.jsx routes → services → backend/src/app/api, plus a scripted endpoint cross-check (backend/scripts/endpoint-crosscheck.cjs: 723 unique frontend service calls vs 648 backend route files)', size: 18, italics: true, color: '555555' })] }));

// 1. Executive summary
children.push(H1('1. Executive Summary'));
children.push(P(`This report replaces the previous completion report in full. The previous revision scored several modules at 100% on the basis of screen and endpoint presence. This revision traces every sidebar item to its route, every route to its service calls, and every service call to a backend handler, and it scores accordingly. The result is materially lower and more accurate.`));
children.push(P(`Weighted system completion: Frontend ${overall.fe}% · Backend ${overall.be}% · Cross-module integration ${overall.integ}% · Weighted holistic ${overall.hol}%.`));
children.push(P('The decisive findings driving the revision:'));
children.push(B('Task Management is not partially complete — it is non-functional. Its dashboard link leads to a 404 (no /tasks-dashboard route exists), "My Assigned Tasks" renders a hard-coded mock array, its service file targets a /api/task namespace that has no backend implementation, and four additional task screens exist un-routed. It is scored 1%.'));
children.push(B('Loans & Benefits is an actively rebuilt module with a genuinely new, coherent backend (33 route files) and new pages wired to it — but the emailed external-guarantor link (/guarantor-response) is commented out of the router, so guarantors land on a 404; and three implemented backend operations (claim pay-out, loan cancellation, reports) are never called by any screen. Scored 61%.'));
children.push(B('Offboarding\'s staff self-service journey is broken by a single-character-class bug: the backend file offboarding/my/routes.ts is never served by Next.js (it must be route.ts), so the staff Offboarding Center cannot load its data. The HR side is fully wired. Scored 65%.'));
children.push(B('Training & Certifications carries the largest dead/disconnected surface in the application: an entire question-bank contract with no backend, a user-facing attempt-reassign action with no endpoint, certification-template publish with no handler, an employee lookup with no list route, six analytics export/action calls with no backend, and four "coming soon" placeholder surfaces inside otherwise built screens. Scored 64%.'));
children.push(B('Finance & Payroll is strong where it is new (payroll generation, compensation upload, account validator, payslip delivery) but still mounts legacy debris: /process-payroll calls a backend route that does not exist, two navigation actions point at /admin/... routes that are not registered (404), and two mounted screens are 3-line stubs. Scored 80%.'));
children.push(B('Attendance (91%) and Meetings (91%) are the cleanest modules: complete routes, complete handlers, no dead surface found. No module is awarded 100% under the rules of this review.'));

// 2. Scoring methodology
children.push(H1('2. Scoring Methodology'));
children.push(P('Each module receives three 0–100 scores, assigned only from traced evidence:'));
children.push(B('Frontend (35% of holistic): every sidebar screen has a working route; every route renders a functional screen; actions connect to real services; loading/success/error/empty/permission states handled; navigation between related screens works; no placeholder, commented-out or unreachable screens.'));
children.push(B('Backend (35% of holistic): all required endpoints exist and are operational (handler + authorization + company scope + validation + persistence + response shape); contracts match frontend expectations; no unused, duplicate, superseded or dead implementations; commented-out or replaced endpoints reduce the score when the workflow is still exposed.'));
children.push(B('Integration (30% of holistic): data exchange across modules is correct and consistent end to end (company → staff → department/designation/grade → compensation → attendance/leave → payroll/payslip → loans/benefits → reporting); a backend-heavy module with weak frontend integration loses points here, as does a frontend-heavy module with disconnected endpoints.'));
children.push(P('Dead-code penalty: applied before the holistic calculation, visibly, per module. The penalty subtracts the same number of points from each of the three component scores, so it flows into the holistic score at full weight. Penalty magnitudes used: 1 = cosmetic unused code only; 2 = a few unused/superseded endpoints or dead links; 3–4 = a broken user-facing workflow or mounted placeholder screens; 5–8 = multiple broken workflows, dead screens, or an entire dead contract.'));
children.push(P('Holistic = Frontend×0.35 + Backend×0.35 + Integration×0.30 (after penalty). Evidence labels: CONFIRMED (traced both sides), PARTIAL (present but incomplete), DISCONNECTED (present on one side, broken/absent on the other), DEAD (served to no one / serves no one), MISSING (absent on both sides).'));

// 3. Weighting methodology
children.push(H1('3. Weighting Methodology'));
children.push(P('Module weights reflect practical business criticality for an HRMS customer, not code volume. The suggested baseline weights were adjusted for two sidebar modules the baseline does not list — Meetings and Task Management — and one structural fact: the sidebar\'s Reporting group is keyed to the PAYROLL / ATTENDANCE / LEAVE module keys, so reporting screens are scored inside those modules rather than as a separate module. Adjustments: 1 point moved from Core Setup and 1 from Staff Management (their surfaces overlap heavily with Staff Management scoring), and Onboarding reduced 7→6 because its "New Hires" screen is the Recruitment onboarding dashboard (shared surface). Meetings receives 2% (real product surface, small audience); Task Management receives 1% (staff-only self-service, currently dead). Weights sum to 100.'));
const weightRows = MODULES.map((m) => [m.name, m.weight + '%', 'Baseline ' + (m.name === 'Meetings' ? '— (added)' : m.name === 'Task Management' ? '— (added)' : 'as suggested')]);
children.push(makeTable(['Module', 'Weight', 'Note'], weightRows, [46, 14, 40]));
children.push(GAP());

// 4-7. Overall percentages
children.push(H1('4. Overall System Scores'));
children.push(makeTable(
  ['Measure', 'Score', 'How computed'],
  [
    ['Overall frontend completion', overall.fe + '%', 'Weighted mean of per-module frontend scores (after dead-code penalty).'],
    ['Overall backend completion', overall.be + '%', 'Weighted mean of per-module backend scores (after dead-code penalty).'],
    ['Overall cross-module integration', overall.integ + '%', 'Weighted mean of per-module integration scores (after dead-code penalty).'],
    ['Weighted holistic system completion', overall.hol + '%', 'Weighted mean of per-module holistic scores; equals applying the 35/35/30 formula to the three overall figures (±1 rounding).'],
  ],
  [34, 12, 54]
));
children.push(GAP());

// 8. Module summary table
children.push(H1('5. Module Summary Table'));
children.push(P('Scores shown are after the dead-code penalty. "Pen." is the penalty applied to each component. Holistic = FE×.35 + BE×.35 + IN×.30.'));
const sumRows = MODULES.map((m) => {
  const p = penalized(m);
  return [m.name, m.weight + '%', p.fe, p.be, p.integ, m.penalty > 0 ? '−' + m.penalty : '0', m.hol + '%'];
});
children.push(makeTable(
  ['Module', 'Weight', 'FE', 'BE', 'Integration', 'Pen.', 'Holistic'],
  sumRows,
  [30, 10, 10, 10, 16, 10, 14]
));
children.push(GAP());

// Status legend
children.push(H1('6. Status Categories Used Below'));
children.push(B('Implemented and integrated — frontend, backend and cross-module data flow all traced working.'));
children.push(B('Implemented but disconnected — exists on one side, broken, unserved or uncalled on the other.'));
children.push(B('Partially implemented — present with real functionality but incomplete surfaces or placeholder sections.'));
children.push(B('Dead or unused — served to no one or serving no one (dead routes, orphan screens/services, superseded duplicates).'));
children.push(B('Missing — absent on both sides.'));

// 9. Detailed assessments
children.push(H1('7. Detailed Module Assessments'));
for (const m of MODULES) {
  const p = penalized(m);
  children.push(H2(m.name));
  children.push(KV('Sidebar items traced', m.items));
  children.push(KV('Weight', m.weight + '%'));
  children.push(KV('Frontend score', `${p.fe}% (base ${m.fe}${m.penalty > 0 ? ` − penalty ${m.penalty}, floored at 0` : ', no penalty'})`));
  children.push(KV('Backend score', `${p.be}% (base ${m.be}${m.penalty > 0 ? ` − penalty ${m.penalty}, floored at 0` : ', no penalty'})`));
  children.push(KV('Integration score', `${p.integ}% (base ${m.integ}${m.penalty > 0 ? ` − penalty ${m.penalty}, floored at 0` : ', no penalty'})`));
  children.push(KV('Holistic score', `${m.hol}% = ${p.fe}×.35 + ${p.be}×.35 + ${p.integ}×.30`));
  children.push(H3('Evidence'));
  for (const e of m.evidence) children.push(B(e));
  children.push(H3('Dead or unused implementation found'));
  if (m.dead.length === 0) children.push(B('None found.'));
  for (const d of m.dead) children.push(B(d));
  children.push(H3('Real remaining gaps'));
  for (const g of m.gaps) children.push(B(g));
  children.push(GAP());
}

// 16. dependency map
children.push(H1('8. Cross-Module Dependency Map (plain language)'));
children.push(P('The following chains were traced in source. Each link was verified on both sides unless marked otherwise.'));
children.push(B('Company → everything: every module-scoped backend route resolves the caller\'s company (validateCompanyAccess / company-scoped queries); the frontend pins a current company in AuthContext and passes companyId. CONFIRMED for payroll generation, compensation, attendance, leave, PHED, loans/benefits, certifications, training.'));
children.push(B('Core Setup → Staff Management: departments, designations, grade levels and business units created in Core Setup are consumed by staff records and Employee Profile 360; staff sync operations write back department/designation (STAFF_DESIGNATION_DEPARTMENT_SYNC_REPORT.md documents this sync). CONFIRMED with the department staff-remove contract exception noted in Core Setup.'));
children.push(B('Staff Management → Payroll: Staff Compensation Upload writes per-staff compensation that Payroll Generation reads when producing runs; payroll generation exclude/include and row edits round-trip to the same staff entities. CONFIRMED.'));
children.push(B('Attendance & Leave → Reporting and Profile 360: the admin/staff attendance feeds and leave balances/requests are re-consumed by the reporting screens and Employee Profile 360. CONFIRMED.'));
children.push(B('Recruitment → Onboarding: an accepted offer with initiateOnboarding creates the Onboarding record; the Onboarding Command Center lists and progresses those records; the candidate document-upload portal feeds /staff/onboarding-documents which both sides read. CONFIRMED (with the module-gate placement quirk noted under Onboarding).'));
children.push(B('Recruitment → Offer Letters: recruitment offers generate/download letters and dispatch emails; the standalone Offer Letters module runs the templating/mailbox pipeline; the executed contract returns through offer execute. CONFIRMED.'));
children.push(B('Payroll → Payslips → staff self-service: generated runs approve into Payroll/Payslip records; Company Payslips, email delivery and My Payslips (regular and PHED) read the same records; duplicates detection guards re-issuance. CONFIRMED.'));
children.push(B('PHED → Core payroll data: PHED pay periods compute from staff, grades, tax profiles and overtime/validations uploaded per period; the treasury/IAD/tax reports are derived views of the computed period. CONFIRMED for every reportType used by a screen.'));
children.push(B('Loans & Benefits → Staff/Finance: loan requests reference staff and guarantor staff records; disbursement/force-recovery are finance actions; Employee Profile 360 displays the per-staff loans-benefits feed (/staff/{id}/loans-benefits). PARTIAL — profile display is CONFIRMED, but the claims pay-out step is never callable from the UI and the external guarantor email loop 404s, so the module\'s outward edges are the weakest in the app.'));
children.push(B('Offboarding → Staff status: HR review/approve/handover transitions records; the staff center is intended to mirror them. DISCONNECTED today because /offboarding/my is not served (routes.ts filename), and the detail/exit-interview screens the dashboard expects are commented out or stubs.'));
children.push(B('Meetings → Recruitment interviews: interview scheduling links into the meetings room via token join. PARTIAL — the meetings APIs are complete; the recruitment interview flow references meeting creation through the interviews scheduler. Treated as working where traced, with the external-guest model limitation noted under Meetings.'));

// 15. consolidated gaps
children.push(H1('9. Consolidated Real Gaps and Disconnected Workflows'));
const GAPS = [
  ['Task Management', 'Sidebar "Task Dashboard" → /tasks-dashboard', 'No such route exists; click lands on 404.', 'Module scored 1%; drives the module-level penalty of 2.', 'Implement the dashboard + /api/task backend or remove the module from the sidebar.'],
  ['Task Management', '/assigned-tasks (AssignedTasks.jsx)', 'Hard-coded 3-row mock; buttons have no handlers; TaskService targets a non-existent /api/task namespace; 4 orphan screens fetch non-existent /api/tasks endpoints.', 'FE capped at 3 after penalty; BE 0; IN 0.', 'Full implementation or deletion of the module surface.'],
  ['Loans & Benefits', 'Emailed guarantor link → /guarantor-response', 'Route commented out in App.jsx while email.ts emits the link; token page and endpoints exist.', 'Largest single integration loss in the module (holistic 61%).', 'Uncomment/restore the route and verify the token loop end to end.'],
  ['Loans & Benefits', 'Claims pay-out / loan cancel / reports endpoints', 'Implemented backend operations (benefit-claims/{id}/pay, loan-requests/{id}/cancel, /reports) have no frontend caller.', 'Backend completeness reduced; integration reduced.', 'Surface the three operations in LoanManagementAdmin / ClaimsReimbursements / Financial Dashboard, or remove the endpoints.'],
  ['Loans & Benefits', 'Rebuild migration 20260911120000_rebuild_loans_benefits', 'Schema rebuild present in the working tree but not applied in this checkout (migrations forbidden by the review constraints).', 'Persistence verified statically only; noted as unavailable evidence, not scored down beyond the penalties above.', 'Apply in a development database and re-verify the request lifecycle.'],
  ['Offboarding', 'Staff Offboarding Center → GET /offboarding/my', 'Backend directory contains routes.ts (not route.ts); Next.js never serves it; staff center cannot load its records.', 'Staff journey broken; drives penalty 6 and integration 60.', 'Rename the file to route.ts (one-line fix) and re-verify.'],
  ['Offboarding', '/offboarding/create, /offboarding/:id, /offboarding/staff/:id, /exit-interview', 'Detail/create routes commented out; /exit-interview renders a 3-line stub.', 'FE reduced; HR cannot open per-case detail.', 'Implement or remove the routes and stub.'],
  ['Training & Certifications', 'QuestionBank standalone mode', 'GET/POST/DELETE /question-bank/questions and /import have no backend namespace.', 'Dead workflow kept mounted; contributes to penalty 6.', 'Implement the namespace or strip the standalone mode.'],
  ['Training & Certifications', 'AttemptReview "Reassign" action', 'POST /attempts/{id}/reassign does not exist.', 'User-facing action fails.', 'Add the endpoint or remove the action.'],
  ['Training & Certifications', 'Certification template publish', 'POST /certification-templates/{id}/publish has no handler (route implements GET/PUT/PATCH/DELETE only).', 'Publish degrades to a warning toast.', 'Add POST handling or drive status via PATCH.'],
  ['Training & Certifications', 'Certification issuance employee lookup', 'GET /employees has no list route (only /employees/{staffId}/peek).', 'Issuance modal shows the failure path.', 'Add a list endpoint or reuse /staff/records.'],
  ['Training & Certifications', 'Six analytics export/action calls', 'trends/dashboard/skills/risk exports and compliance reminders/batch-process and risk item actions have no backend handlers.', 'Screens degrade to warning banners.', 'Implement handlers or remove the controls.'],
  ['Training & Certifications', 'TrainingDetails tabs 1–4, AI insights card, calendar action, compliance columns', 'Literal "coming soon" placeholders inside built screens.', 'FE reduced directly.', 'Build or remove each placeholder surface.'],
  ['Finance & Payroll', '/process-payroll → GET /payroll/data/{fileId}', 'Backend route does not exist; screen fails at runtime.', 'Broken mounted screen; contributes to penalty 4.', 'Implement the route or retire the screen.'],
  ['Finance & Payroll', 'ViewPayslip / PayrollSuccessModal navigation', 'Navigate to /admin/generated-payslips and /admin/payroll-dashboard — unregistered paths → 404.', 'Dead navigation after core actions.', 'Correct the paths.'],
  ['Finance & Payroll', '/positions-deductions-allowances and /performance-appraisals', 'Mounted 3-line stub screens with no backend.', 'Placeholder screens; penalty contributor.', 'Implement or remove both.'],
  ['Finance & Payroll', 'PayrollTemplates.jsx TODO', 'Screen still contains "Replace with real API call" logic.', 'Partial screen.', 'Complete the API wiring or retire the route.'],
  ['Leave', 'Leave cancel (staff)', 'cancelLeaveRequest posts /leaves/{id}/cancel; backend has no such route.', 'User-facing action fails; largest Leave penalty contributor.', 'Add the endpoint with ownership/status guards or rewire the modal.'],
  ['Leave', '/leave-applications', '3-line stub reachable by URL.', 'Placeholder screen.', 'Implement or remove.'],
  ['Leave', 'leaveService.rejectLeaveRequest', 'Targets /leaves/{id}/reject which does not exist; function unused.', 'Dead service function.', 'Delete or align with hr-approve/manager-approve.'],
  ['Core Setup', 'Department Staff Roster "remove"', 'Frontend POST /departments/{id}/staff/{staffId}/remove matches no backend route (backend serves /departments/{staffId}/remove).', 'Action fails at runtime; integration reduction.', 'Align the contract on one side.'],
  ['Core Setup', 'CompanyService legacy /company block; peekEmployee /v1/employees mismatch', 'Commented-out legacy endpoints; peek helper targets a path that does not exist and is unused.', 'Dead code only (no user impact).', 'Delete both.'],
  ['Recruitment', 'Internal Vacancies & /admin/vacancies link', 'Stub page; JobDetails links to an unregistered route.', 'Dead nav + placeholder screen; penalty 2.', 'Implement or remove.'],
  ['Recruitment', 'assessments/report, selection/report, offers/template/download', 'Implemented endpoints with no frontend caller.', 'Backend completeness reduction.', 'Surface in UI or delete.'],
  ['PHED Payroll Engine', 'Superseded template routes + company aggregate', 'issue-template/template/upload-template and /phed/reports/aggregate unused; UI uses the validations/overtime template routes and per-period aggregate.', 'Superseded duplicates; penalty 2.', 'Delete the duplicates or rewire the UI.'],
  ['Onboarding', 'Module gate placement', '/onboarding (New Hires) sits under the RECRUITMENT gate while the sidebar lists it under Onboarding.', 'Module enablement mismatch; integration reduction.', 'Move the route under the ONBOARDING gate.'],
  ['Offer Letters', 'Bulk-job status family', 'Used only by the dashboard poller; no other dead surface found.', 'Penalty 1 (minor).', 'None required.'],
  ['Meetings', 'External guest model', 'Guests join only via organiser-issued tokens; no self-service external participant model.', 'Product gap acknowledged; no penalty (no dead code).', 'Design decision required; not a code defect.'],
  ['System-wide', '/accept-invite backend contract', 'Frontend AcceptInvite page calls /core/invitations/validate and /accept; no /api/core/invitations namespace exists anywhere in the backend.', 'Invitation-acceptance workflow cannot succeed; scored under Staff Management (invite flows) via reduced backend integration headroom.', 'Implement the invitation endpoints or route the page to the existing complete-registration flow.'],
];
children.push(makeTable(['Module', 'Screen / route / service', 'What is disconnected or incomplete', 'Score effect', 'What must be completed'], GAPS, [13, 20, 28, 19, 20]));
children.push(GAP());

// 18. prioritized list
children.push(H1('10. Final Prioritized Completion List'));
children.push(P('Ordered by weighted impact on system completion (weight × gap severity), then by user-facing severity.'));
const PRI = [
  '1. Restore the Loans & Benefits external guarantor loop — uncomment /guarantor-response, verify the emailed token against /api/staff-loans-benefits/guarantor/respond (module weighted 4% but the fix is one line and unblocks a compliance-relevant workflow).',
  '2. Rename offboarding/my/routes.ts → route.ts and verify the staff Offboarding Center loads, submits handover and reaches approval (Offboarding, weight 2%).',
  '3. Decide and execute Task Management: implement /tasks-dashboard + /api/task and wire AssignedTasks, or delete the sidebar group, route, service and four orphan screens (Task Management, weight 1%, currently 1%).',
  '4. Repair Finance & Payroll legacy debris: implement or retire /process-payroll and /payroll/data/{fileId}; fix the two /admin/... navigation targets; implement or remove the two stub routes and the PayrollTemplates TODO (Finance & Payroll, weight 15% — largest weight affected).',
  '5. Add the missing Leave cancel endpoint (or rewire the modal) and remove rejectLeaveRequest (Leave, weight 8%).',
  '6. Training & Certifications backend catch-up: attempts/{id}/reassign, certification-template publish, an employees list endpoint, the question-bank decision, and the six missing analytics export/action handlers; then clear the four "coming soon" surfaces (weight 8%).',
  '7. Align the department staff-remove contract between StaffRosterTab and the backend (Core Setup, weight 11%).',
  '8. Implement or remove Recruitment\'s Internal Vacancies stub and /admin/vacancies link; delete the three unused recruitment endpoints (weight 10%).',
  '9. Delete PHED\'s superseded pay-period template routes and company-level aggregate duplicate (weight 8%).',
  '10. Move /onboarding under the ONBOARDING module gate and gate the underlying data routes consistently (weight 6%).',
  '11. Implement or retire the /core/invitations validate/accept contract used by AcceptInvite (affects invite-driven onboarding across companies).',
  '12. Sweep remaining dead code: CompanyService legacy block, peekEmployee, unused payslip duplicate-check endpoints, /admin/dashboard/cards, /admin/dashboard/staffsearch, departments position-update endpoint, staff transfer search endpoint.',
];
for (const t of PRI) children.push(B(t));

children.push(GAP());
children.push(H2('Basis of Review'));
children.push(B('Sidebar inventory: frontend/src/pages/global/Sidebar.jsx (unifiedMenu, module keys, role and PHED visibility rules).'));
children.push(B('Route inventory: frontend/src/App.jsx including ProtectedModuleRoute, RoleRoute guards and commented-out blocks.'));
children.push(B('Service inventory: all 39 files in frontend/src/services plus direct API calls found in pages/components.'));
children.push(B('Backend inventory: all 648 route.ts files under backend/src/app/api, with handler-verb spot checks on every flagged contract.'));
children.push(B('Scripted cross-check: backend/scripts/endpoint-crosscheck.cjs (kept in the repository for reproduction) — 723 unique frontend service calls matched against 648 backend routes, plus a reverse unused-endpoint pass; its raw output was manually confirmed item by item before inclusion above.'));
children.push(B('Working-tree evidence: git status deletions/modifications around the Loans & Benefits rebuild and device management; Prisma migration directory inspected but not applied.'));
children.push(B('Excluded per scope: the Super Admin sidebar group and /super-admin routes; test quality, deployment and UAT are intentionally not scored.'));

// ---------- build ----------
const doc = new Document({
  creator: '247HR Review',
  title: '247HR Module Completion Report',
  description: 'Deep frontend/backend/integration completion assessment',
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 20 } },
    },
  },
  sections: [{ properties: {}, children }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log('WROTE', OUT, buf.length, 'bytes');
}).catch((e) => { console.error(e); process.exit(1); });
