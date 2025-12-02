// src/app/lib/apiDocs.ts

export type ApiDoc = {
  id: string
  group: 'Auth' | 'Staff' | 'Payroll' | 'Payslip & Profile'
  method: 'GET' | 'POST'
  path: string
  title: string
  description: string
  auth?: string
  input?: string
  output?: string
  sample?: any   // make this optional
}

export const apiDocs: ApiDoc[] = [
  // ======================
  // AUTH
  // ======================

  {
    id: 'auth-register',
    group: 'Auth',
    method: 'POST',
    path: '/api/auth/register',
    title: 'Register new user (admin-provisioned)',
    description:
      'SUPER_ADMIN (or authorized HR) can create a new login/staff account for a company. Multi-company aware: companyId is taken from the JWT token.',
    auth: 'Authorization: Bearer <SUPER_ADMIN token>',
    input:
      'JSON body: { email, firstName, lastName, role ("HR" | "STAFF" | "SUPER_ADMIN"), department?, position? }',
    output:
      'JSON: { success, message, data: { user: { id, email, firstName, lastName, role, department, position, companyId } } }',
  },

  {
    id: 'auth-complete-registration',
    group: 'Auth',
    method: 'POST',
    path: '/api/auth/complete-registration',
    title: 'Staff complete registration',
    description:
      'First-time staff self-service registration. Staff enters staffId, email, and password. System validates against StaffRecord for a specific company and enables login.',
    auth: 'No auth required',
    input:
      'JSON body: { staffId, email, password }',
    output:
      'JSON: { success, message, data: { token, user: { id, staffId, email, firstName, lastName, department, position, role, companyId } } }',
  },

  {
    id: 'auth-login',
    group: 'Auth',
    method: 'POST',
    path: '/api/auth/login',
    title: 'User login',
    description:
      'Logs in a staff / HR / SUPER_ADMIN account with email and password. Returns a JWT containing companyId so all requests are auto-scoped per company.',
    auth: 'No auth required',
    input: 'JSON body: { email, password }',
    output:
      'JSON: { success, message, data: { token, user: { id, staffId?, email, firstName, lastName, role, department?, position?, companyId }, company?: { id, companyName, email, phone } } }',
  },

  {
    id: 'auth-me',
    group: 'Auth',
    method: 'GET',
    path: '/api/auth/me',
    title: 'Get current user',
    description:
      'Returns the authenticated user and company based on the JWT. Multi-company aware: companyId is read from token.',
    auth: 'Authorization: Bearer <token>',
    input: 'No body',
    output:
      'JSON: { success, message, data: { user: { id, staffId?, email, firstName, lastName, role, companyId }, company?: { id, companyName, email, phone } } }',
  },

  // ======================
  // STAFF
  // ======================

  {
    id: 'staff-upload',
    group: 'Staff',
    method: 'POST',
    path: '/api/staff/upload',
    title: 'Upload staff records',
    description:
      'HR uploads staff master data from Excel to create or update StaffRecord rows for the current company. The company is taken from the JWT (companyId).',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input:
      'multipart/form-data: file = .xlsx staff template (company-scoped via JWT companyId)',
    output:
      'JSON: { success, message, data: { uploadId, companyId, summary: { totalRecords, successful, failed }, errors?: [ { rowNumber, message } ] } }',
  },

  {
    id: 'staff-records',
    group: 'Staff',
    method: 'GET',
    path: '/api/staff/records',
    title: 'List staff records',
    description:
      'Returns a paginated list of staff records for the authenticated user’s company. Multi-company aware via JWT companyId.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input: 'Optional query: page, pageSize, search',
    output:
      'JSON: { success, message, data: { companyId, items: [ { id, staffId, firstName, lastName, email, department, position, phone?, bankName?, accountNumber?, isActive } ], pagination: { page, pageSize, total } } }',
  },

  // ======================
  // PAYROLL
  // ======================

  {
    id: 'payroll-upload-post',
    group: 'Payroll',
    method: 'POST',
    path: '/api/payroll/upload',
    title: 'Upload payroll and generate payslips',
    description:
      'HR uploads payroll Excel/CSV for one company. System parses rows, creates/updates Payroll entries, generates payslip PDFs (Payslip table), optionally sends notification emails, and records failed rows in PayrollUpload. Multi-company aware via JWT companyId.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input:
      'multipart/form-data: file = .xlsx or .csv payroll file, sendEmails = "true" | "false"',
    output:
      'JSON: { success, message, data: { uploadId, companyId, results: { successful, failed, payslipsGenerated, emailsSent, errors: [ { rowNumber, message } ] }, summary: { totalProcessed, successful, failed, payslipsGenerated, emailsSent }, failedRecordsDownload?: string } }',
  },

  {
    id: 'payroll-upload-get',
    group: 'Payroll',
    method: 'GET',
    path: '/api/payroll/upload',
    title: 'Download payroll template',
    description:
      'Returns the standard payroll Excel template that HR should populate and upload for the current company.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token> (recommended)',
    input: 'No body',
    output: 'Excel file (.xlsx)',
  },

  {
    id: 'payroll-download-failed',
    group: 'Payroll',
    method: 'GET',
    path: '/api/payroll/download-failed/[id]',
    title: 'Download failed payroll records',
    description:
      'Downloads the Excel file containing all rows that could not be processed for a given PayrollUpload batch. Enforced by companyId from JWT.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input: 'Path param: id = PayrollUpload.id',
    output:
      'Excel file (.xlsx) of failed rows, or JSON error if not found or not owned by your company.',
  },

  // ======================
  // PAYSLIP / PROFILE
  // ======================

  {
    id: 'profile-payslips',
    group: 'Payslip & Profile',
    method: 'GET',
    path: '/api/profile/payslips',
    title: 'Get payslip history for logged-in staff',
    description:
      'Returns all payslips belonging to the authenticated staff member for their current company. Ideal for the staff self-service profile page.',
    auth: 'Authorization: Bearer <STAFF | HR | SUPER_ADMIN token>',
    input: 'No body',
    output:
      'JSON: { success, message, data: { staffId, email, companyId, payslips: [ { id, payrollId, month, year, grossPay, netPay, createdAt, fileName, downloadUrl } ] } }',
  },

  {
    id: 'payslip-download',
    group: 'Payslip & Profile',
    method: 'GET',
    path: '/api/payslips/[id]/download',
    title: 'Download a payslip PDF',
    description:
      'Streams a single payslip PDF. Staff can only download their own payslips for their company; HR/SUPER_ADMIN can download any payslip within their company.',
    auth: 'Authorization: Bearer <token>',
    input: 'Path param: id = Payslip.id',
    output:
      'PDF file (Content-Type: application/pdf) or JSON error if unauthorized or not in the same company.',
  },
]
