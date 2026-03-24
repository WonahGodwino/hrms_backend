// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CssBaseline, ThemeProvider } from '@mui/material';

import RequestDemo from '@/pages/Public/RequestDemo';
import Login from '@/pages/Public/Login';
import ApplicantRegister from '@/pages/Public/ApplicantRegister';
import AcceptInvite from './pages/Public/AcceptInvite';
import CompleteRegistration from './pages/Public/CompleteRegistration';

// --- NEW RECRUITMENT MODULE IMPORTS (Public) ---
import PublicJobsBoard from '@/pages/recruitment/PublicJobsBoard';
import JobDetailsView from '@/pages/recruitment/JobDetailsView';
import ApplicationSuccessView from '@/pages/recruitment/ApplicationSuccessView';

import MainLayout from '@/layouts/MainLayout';
// Fixed: Removed unused 'useAuth'
import { AuthProvider } from './lib/context/AuthContext';
import RoleRoute from './components/RoleRoute';
import PrivateRoute from './components/PrivateRoute';

// Theme
import { ColorModeContext, useMode } from './theme';

// --- UNIFIED DASHBOARD IMPORT ---
import SystemDashboard from '@/components/dashboard/SystemDashboard';

// Pages
import InternalVacancies from '@/pages/employee/InternalVacancies';
// import MyApplications from '@/pages/employee/MyApplications';
import AssignedTasks from '@/pages/employee/AssignedTasks';
import LeaveApplications from '@/pages/employee/LeaveApplications';
import MyTrainings from '@/pages/employee/MyTrainings';
import Certifications from '@/pages/employee/Certifications';
import LoanRequests from '@/pages/employee/LoanRequests';
import YearEndAppraisal from '@/pages/employee/YearEndAppraisal';
import ExitInterview from '@/pages/employee/ExitInterview';

import CompanyOverview from '@/pages/core-setup/companies/CompanyOverview';
// import Departments from '@/pages/core-setup/departments/Departments';
// import BusinessUnits from '@/pages/core-setup/business-units/BusinessUnits';
import StaffManagement from './pages/core-setup/staff-management/StaffManagement';
import StaffUploadHistory from './pages/core-setup/staff-management/StaffUploadHistory';
import StaffAssignCompanies from './pages/core-setup/staff-management/StaffAssignCompanies';
// --- NEW LEAVE MODULE IMPORTS ---
import LeaveDashboard from './pages/leave/leaveDashboard';
import LeaveHistory from './pages/leave/leaveHistory';

// --- NEW RECRUITMENT MODULE IMPORTS (Admin/HR) ---
import HRJobsDashboard from '@/pages/recruitment/HRJobsDashboard';
import HRJobDetailsView from './pages/recruitment/HRJobDetailsView';
import CreateJobForm from '@/pages/recruitment/CreateJobForm';
import ApplicantList from './pages/recruitment/ApplicantList';
import ApplicantKanbanBoard from '@/pages/recruitment/ApplicantKanbanBoard';
import ApplicantDetailView from '@/pages/recruitment/ApplicantDetailView';
import InterviewerDashboard from '@/pages/recruitment/InterviewerDashboard';

// --- NEW ONBOARDING MODULE IMPORTS ---
import OnboardingCommandCenter from '@/pages/onboarding/OnboardingCommandCenter';

// (Old Recruitment Imports - Kept for reference/migration)
import JobDetails from '@/pages/admin/recruitment-onboarding/JobDetails';
import JobApplyPage from '@/pages/admin/recruitment-onboarding/JobApplyPage';

import AptitudeTests from '@/pages/admin/AptitudeTests';
import ReportsHub from '@/pages/admin/ReportsHub';
import TrainingSetup from '@/pages/admin/TrainingSetup';
import CertificationSetup from '@/pages/admin/CertificationSetup';
import LeaveSettings from '@/pages/admin/LeaveSettings';
import LeaveApprovers from '@/pages/admin/LeaveApprovers';
import ImportLeaveRecords from '@/pages/admin/ImportLeaveRecords';
import PayrollTemplates from '@/pages/payroll/PayrollTemplates';
import PayrollDashboard from '@/pages/payroll/PayrollDashboard';
import ProcessPayroll from '@/pages/payroll/ProcessPayroll';
import PayrollHistory from './pages/payroll/PayrollHistory';
import PositionsDeductionsAllowances from '@/pages/admin/PositionsDeductionsAllowances';
import LoanTerms from '@/pages/admin/LoanTerms';
import AllStaffLoans from '@/pages/admin/AllStaffLoans';
import BenefitsCatalog from '@/pages/admin/BenefitsCatalog';
import PerformanceAndAppraisals from '@/pages/admin/PerformanceAndAppraisals';
import OffboardingHub from './pages/admin/offboarding/OffboardingHub';
// import OffboardingCreateWizard from "./pages/admin/offboarding/OffboardingCreateWizard";
// import TaskDashboard from './pages/admin/tasks/TaskDashboard';
import AttendanceDashboard from '@/pages/admin/AttendanceDashboard';
import OffboardingCreateWizard from './pages/admin/offboarding/OffboardingCreateWizard';
import OffboardingDetails from './pages/admin/offboarding/OffboardingDetails';
import StaffOffboardingView from './pages/admin/offboarding/StaffOffboardingView';
import PayrollSettings from './pages/payroll/PayrollSettings';
import GeneratedPayslips from './pages/payroll/GeneratedPayslips';
import ViewPayslip from './pages/payroll/ViewPayslip';
import CompanyPayslips from './pages/payslips/CompanyPayslips';
import StaffPayslips from './pages/payslips/StaffPayslips';
import DocumentationPage from './pages/Public/Documentation';
import DocumentationPayrollPage from './pages/Public/Documentation-payroll';
import DocumentationStaffManagementPage from './pages/Public/Documentation-staff-management';
import ForgotPasswordPage from './pages/Public/ForgotPassword';
import ResetPasswordPage from './pages/Public/ResetPassword';
// import HRView from './components/offboarding/HRView';
// import EmployeeView from './components/offboarding/EmployeeView';
// import AdminView from './components/offboarding/AdminView';
import CompanyProfile from './pages/core-setup/companies/CompanyProfile';
import TemplateDashboard from './pages/template/TemplateDashboard';
import CreateTemplatePage from './pages/template/CreateTemplate';
import Landing from './pages/Public/Landing';
import Pricing from './pages/Public/Pricing';
import AccountValidatorPage from './pages/account-validator/AccountValidator';

// --- PAYROLL ENGINE MODULE IMPORTS ---
import PayPeriodsDashboard from './pages/payroll-engine/PayPeriods/PayPeriodsDashboard';
import SalaryStructuresDashboard from './pages/payroll-engine/EmployeeSalaries/SalaryStructuresDashboard';
import DeductionsDashboard from './pages/payroll-engine/Deductions/DeductionsDashboard';
import OvertimeDashboard from './pages/payroll-engine/Overtime/OvertimeDashboard';
import PayslipsDashboard from './pages/payroll-engine/ComputedPayslips/PayslipsDashboard';
import EngineMyPayslips from './pages/payroll-engine/ComputedPayslips/MyPayslips';
import ValidationPortal from './pages/payroll-engine/Validation/ValidationPortal';
import PayrollReportsDashboard from './pages/payroll-engine/Reports/ReportsDashboard';

// --- TAX FILING MODULE IMPORTS ---
import TaxFilingDashboard from './pages/payroll-engine/TaxFiling/TaxFilingDashboard';
import TaxProfilesDashboard from './pages/payroll-engine/TaxFiling/TaxProfilesDashboard';
import MonthlyFilingDashboard from './pages/payroll-engine/TaxFiling/MonthlyFilingDashboard';
import AnnualFilingDashboard from './pages/payroll-engine/TaxFiling/AnnualFilingDashboard';
import TaxCertificatesDashboard from './pages/payroll-engine/TaxFiling/TaxCertificatesDashboard';

export default function App() {
	const [theme, colorMode] = useMode();

	return (
		<AuthProvider>
			<ColorModeContext.Provider value={colorMode}>
				<ThemeProvider theme={theme}>
					<CssBaseline />
					<BrowserRouter>
						<Routes>
							{/* --- Public Routes --- */}
							<Route
								path="/"
								element={<Landing />}
							/>
							<Route
								path="/request-demo"
								element={<RequestDemo />}
							/>
							<Route
								path="/pricing"
								element={<Pricing />}
							/>
							<Route
								path="/login"
								element={<Login />}
							/>
							<Route
								path="/forgot-password"
								element={<ForgotPasswordPage />}
							/>
							<Route
								path="/forgot-password/reset-password"
								element={<ResetPasswordPage />}
							/>
							<Route
								path="/complete-registration"
								element={<CompleteRegistration />}
							/>
							<Route
								path="/applicant-register"
								element={<ApplicantRegister />}
							/>
							<Route
								path="/documentation"
								element={<DocumentationPage />}
							/>
							<Route
								path="/documentation/staff-management"
								element={<DocumentationStaffManagementPage />}
							/>
							<Route
								path="/documentation/payroll-management"
								element={<DocumentationPayrollPage />}
							/>

							{/* --- NEW PUBLIC RECRUITMENT ROUTES --- */}
							{/* Candidates access these without logging in */}
							<Route
								path="/careers"
								element={<PublicJobsBoard />}
							/>
							<Route
								path="/careers/:jobId"
								element={<JobDetailsView />}
							/>
							<Route
								path="/careers/success"
								element={<ApplicationSuccessView />}
							/>

							<Route
								path="/accept-invite"
								element={
									<RoleRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
										<AcceptInvite />
									</RoleRoute>
								}
							/>

							{/* --- Super Admin (Unified Dashboard handles the view) --- */}
							{/* Route /super-dashboard redirects to /dashboard in new logic, 
                                but keeping specific route for backward compatibility if needed, 
                                mapped to SystemDashboard */}
							<Route
								path="/super-dashboard/*"
								element={
									<PrivateRoute>
										<RoleRoute allowedRoles={['SUPER_ADMIN']}>
											<SystemDashboard />
										</RoleRoute>
									</PrivateRoute>
								}
							/>

							{/* --- Main App Layout (Flattened Routes) --- */}
							<Route
								element={
									<PrivateRoute>
										<MainLayout />
									</PrivateRoute>
								}>
								{/* UNIFIED DASHBOARD ROUTE */}
								{/* Replaces DashboardDispatcher */}
								<Route
									path="/dashboard"
									element={<SystemDashboard />}
								/>

								{/* SHARED / COMMON ROUTES */}
								<Route
									path="/my-payslips"
									element={<StaffPayslips />}
								/>
								<Route
									path="/assigned-tasks"
									element={
										<RoleRoute allowedRoles={['STAFF']}>
											<AssignedTasks />
										</RoleRoute>
									}
								/>
								<Route
									path="/leave-applications"
									element={<LeaveApplications />}
								/>
								<Route
									path="/my-trainings"
									element={<MyTrainings />}
								/>
								<Route
									path="/certifications"
									element={<Certifications />}
								/>
								<Route
									path="/loan-requests"
									element={<LoanRequests />}
								/>
								<Route
									path="/year-end-appraisal"
									element={<YearEndAppraisal />}
								/>
								<Route
									path="/exit-interview"
									element={<ExitInterview />}
								/>

								{/* ADMIN / HR CORE ROUTES */}
								<Route
									path="/companies"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<CompanyOverview />
										</RoleRoute>
									}
								/>
								{/* UPDATED HIERARCHY: Company Profile under Companies */}
								<Route
									path="/companies/profile"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR', 'SUPER_ADMIN']}>
											<CompanyProfile />
										</RoleRoute>
									}
								/>
								{/* UPDATED HIERARCHY: Assign Staff under Companies */}
								<Route
									path="/companies/assign-staff"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<StaffAssignCompanies />
										</RoleRoute>
									}
								/>

								<Route
									path="/staff-management"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<StaffManagement />
										</RoleRoute>
									}
								/>

								{/* UPDATED HIERARCHY: Upload History under Staff Management */}
								<Route
									path="/staff-management/history"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<StaffUploadHistory />
										</RoleRoute>
									}
								/>

								{/* TEMPLATE MANAGEMENT */}
								<Route
									path="/templates"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<TemplateDashboard />
										</RoleRoute>
									}
								/>

								<Route
									path="/templates/create"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<CreateTemplatePage />
										</RoleRoute>
									}
								/>

								{/* Recruitment (Consolidated) */}
								{/* New Recruitment Module */}
								<Route
									path="/jobs"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<HRJobsDashboard />
										</RoleRoute>
									}
								/>
								<Route
									path="/jobs/:jobId/details"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<HRJobDetailsView />
										</RoleRoute>
									}
								/>
								<Route
									path="/jobs/create"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<CreateJobForm />
										</RoleRoute>
									}
								/>
								<Route
									path="/jobs/:jobId/applicants"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<ApplicantList />
										</RoleRoute>
									}
								/>
								{/* NEW: Applicant Kanban Board (Pipeline) */}
								<Route
									path="/jobs/:jobId/kanban"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<ApplicantKanbanBoard />
										</RoleRoute>
									}
								/>
								{/* UPDATED HIERARCHY: Applicant Details under Ranking List */}
								<Route
									path="/jobs/:jobId/applicants/:applicationId"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<ApplicantDetailView />
										</RoleRoute>
									}
								/>

								{/* INTERVIEWS DASHBOARD */}
								<Route
									path="/interviews"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<InterviewerDashboard />
										</RoleRoute>
									}
								/>

								{/* ONBOARDING MODULE */}
								<Route
									path="/onboarding-center"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<OnboardingCommandCenter />
										</RoleRoute>
									}
								/>

								{/* Legacy/Existing Recruitment Routes */}
								<Route
									path="/internal-vacancies"
									element={
										<RoleRoute allowedRoles={['STAFF']}>
											<InternalVacancies />
										</RoleRoute>
									}
								/>
								<Route
									path="/job-applications/jobs/:id"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<JobDetails />
										</RoleRoute>
									}
								/>
								<Route
									path="/job-applications/jobs/:jobId/job-apply/:id"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<JobApplyPage />
										</RoleRoute>
									}
								/>
								<Route
									path="/aptitude-tests"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<AptitudeTests />
										</RoleRoute>
									}
								/>

								{/* Tasks & Attendance */}
								{/* <Route
									path="/tasks-dashboard"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR', 'STAFF']}>
											<TaskDashboard />
										</RoleRoute>
									}
								/> */}
								<Route
									path="/attendance-dashboard"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR', 'STAFF']}>
											<AttendanceDashboard />
										</RoleRoute>
									}
								/>

								{/* Reports & Setup */}
								<Route
									path="/reports-hub"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<ReportsHub />
										</RoleRoute>
									}
								/>
								<Route
									path="/training-setup"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<TrainingSetup />
										</RoleRoute>
									}
								/>
								<Route
									path="/certification-setup"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<CertificationSetup />
										</RoleRoute>
									}
								/>
								<Route
									path="/leave-dashboard"
									element={
										<RoleRoute allowedRoles={['STAFF', 'ADMIN', 'HR', 'SUPER_ADMIN']}>
											<LeaveDashboard />
										</RoleRoute>
									}
								/>
								<Route
									path="/leave-dashboard/history"
									element={
										<RoleRoute allowedRoles={['STAFF', 'ADMIN', 'HR', 'SUPER_ADMIN']}>
											<LeaveHistory />
										</RoleRoute>
									}
								/>
								<Route
									path="/leave-settings"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<LeaveSettings />
										</RoleRoute>
									}
								/>
								<Route
									path="/leave-approvers"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<LeaveApprovers />
										</RoleRoute>
									}
								/>
								<Route
									path="/import-leave-records"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<ImportLeaveRecords />
										</RoleRoute>
									}
								/>

								{/* Payroll */}
								<Route
									path="/payroll-templates"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<PayrollTemplates />
										</RoleRoute>
									}
								/>
								<Route
									path="/payroll-dashboard"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<PayrollDashboard />
										</RoleRoute>
									}
								/>
								<Route
									path="/process-payroll"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<ProcessPayroll />
										</RoleRoute>
									}
								/>
								<Route
									path="/payroll-history"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<PayrollHistory />
										</RoleRoute>
									}
								/>

								{/* Account Validator */}
								<Route
									path="/account-validator"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<AccountValidatorPage />
										</RoleRoute>
									}
								/>

								{/* --- PAYROLL ENGINE ROUTES --- */}
								<Route
									path="/payroll-engine"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<PayPeriodsDashboard />
										</RoleRoute>
									}
								/>
								<Route
									path="/payroll-engine/pay-periods"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<PayPeriodsDashboard />
										</RoleRoute>
									}
								/>
								<Route
									path="/payroll-engine/salaries"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<SalaryStructuresDashboard />
										</RoleRoute>
									}
								/>
								<Route
									path="/payroll-engine/deductions"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<DeductionsDashboard />
										</RoleRoute>
									}
								/>
								<Route
									path="/payroll-engine/overtime"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<OvertimeDashboard />
										</RoleRoute>
									}
								/>
								<Route
									path="/payroll-engine/payslips"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<PayslipsDashboard />
										</RoleRoute>
									}
								/>
								<Route
									path="/payroll-engine/my-payslips"
									element={
										<RoleRoute allowedRoles={['STAFF', 'ADMIN', 'HR']}>
											<EngineMyPayslips />
										</RoleRoute>
									}
								/>
								<Route
									path="/payroll-engine/validation"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<ValidationPortal />
										</RoleRoute>
									}
								/>
								<Route
									path="/payroll-engine/reports"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<PayrollReportsDashboard />
										</RoleRoute>
									}
								/>

								{/* --- TAX FILING ROUTES --- */}
								<Route
									path="/payroll-engine/tax-filing"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<TaxFilingDashboard />
										</RoleRoute>
									}
								/>
								<Route
									path="/payroll-engine/tax-filing/profiles"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<TaxProfilesDashboard />
										</RoleRoute>
									}
								/>
								<Route
									path="/payroll-engine/tax-filing/monthly"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<MonthlyFilingDashboard />
										</RoleRoute>
									}
								/>
								<Route
									path="/payroll-engine/tax-filing/annual"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<AnnualFilingDashboard />
										</RoleRoute>
									}
								/>
								<Route
									path="/payroll-engine/tax-filing/certificates"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<TaxCertificatesDashboard />
										</RoleRoute>
									}
								/>

								<Route
									path="/positions-deductions-allowances"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<PositionsDeductionsAllowances />
										</RoleRoute>
									}
								/>
								<Route
									path="/loan-terms"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<LoanTerms />
										</RoleRoute>
									}
								/>
								<Route
									path="/all-staff-loans"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<AllStaffLoans />
										</RoleRoute>
									}
								/>
								<Route
									path="/benefits-catalog"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<BenefitsCatalog />
										</RoleRoute>
									}
								/>
								<Route
									path="/performance-appraisals"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<PerformanceAndAppraisals />
										</RoleRoute>
									}
								/>

								{/* Offboarding */}
								<Route
									path="/offboarding"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR', 'STAFF']}>
											<OffboardingHub />
										</RoleRoute>
									}
								/>
								<Route
									path="/offboarding/create"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<OffboardingCreateWizard />
										</RoleRoute>
									}
								/>
								<Route
									path="/offboarding/:id"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR', 'STAFF']}>
											<OffboardingDetails />
										</RoleRoute>
									}
								/>
								<Route
									path="/offboarding/staff/:id"
									element={<StaffOffboardingView />}
								/>

								{/* Payroll Settings & Payslips */}
								<Route
									path="/payroll-settings"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<PayrollSettings />
										</RoleRoute>
									}
								/>
								<Route
									path="/generated-payslips"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<GeneratedPayslips />
										</RoleRoute>
									}
								/>
								<Route
									path="/generated-payslips/:id"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR']}>
											<ViewPayslip />
										</RoleRoute>
									}
								/>
								<Route
									path="/company-payslips"
									element={
										<RoleRoute allowedRoles={['ADMIN', 'HR', 'SUPER_ADMIN']}>
											<CompanyPayslips />
										</RoleRoute>
									}
								/>
							</Route>
						</Routes>
					</BrowserRouter>
				</ThemeProvider>
			</ColorModeContext.Provider>
		</AuthProvider>
	);
}
