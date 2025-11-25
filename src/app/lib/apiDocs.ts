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
}

export const apiDocs: ApiDoc[] = [
  // AUTH
  {
    id: 'auth-register',
    group: 'Auth',
    method: 'POST',
    path: '/api/auth/register',
    title: 'Register new user',
    description: 'Registers a new HR, staff, or admin user in the system.',
    auth: 'No auth required',
    input:
      'JSON body: { email, password, firstName, lastName, role? }',
    output:
      'JSON: { success, message, data: { user: { id, email, firstName, lastName, role }, token } }',
  },
  {
    id: 'auth-login',
    group: 'Auth',
    method: 'POST',
    path: '/api/auth/login',
    title: 'User login',
    description: 'Logs in a user and returns a JWT token.',
    auth: 'No auth required',
    input: 'JSON body: { email, password }',
    output:
      'JSON: { success, message, data: { user: { ... }, token } }',
  },
  {
    id: 'auth-me',
    group: 'Auth',
    method: 'GET',
    path: '/api/auth/me',
    title: 'Get current user',
    description: 'Returns the authenticated user based on the provided token.',
    auth: 'Authorization: Bearer <token>',
    input: 'No body',
    output:
      'JSON: { success, message, data: { user: { id, email, firstName, lastName, role } } }',
  },

  // STAFF
  {
    id: 'staff-upload',
    group: 'Staff',
    method: 'POST',
    path: '/api/staff/upload',
    title: 'Upload staff records',
    description:
      'HR uploads staff master data from Excel to create or update staff records.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input:
      'multipart/form-data: file = .xlsx staff template',
    output:
      'JSON: { success, message, data: { summary: { totalRecords, successful, failed }, errors? } }',
  },
  {
    id: 'staff-records',
    group: 'Staff',
    method: 'GET',
    path: '/api/staff/records',
    title: 'List staff records',
    description: 'Returns a paginated list of staff records.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input: 'Optional query: page, pageSize, search',
    output:
      'JSON: { success, message, data: { items: [ { id, staffId, firstName, lastName, email, department, designation, ... } ], pagination: { page, pageSize, total } } }',
  },

  // PAYROLL
  {
    id: 'payroll-upload-post',
    group: 'Payroll',
    method: 'POST',
    path: '/api/payroll/upload',
    title: 'Upload payroll and generate payslips',
    description:
      'HR uploads payroll Excel or CSV. System processes rows, updates Payroll, generates HTML-based payslip PDFs, optionally sends emails, and records failed rows.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input:
      'multipart/form-data: file = .xlsx or .csv payroll file, sendEmails = "true" | "false"',
    output:
      'JSON: { success, message, data: { results: { successful, failed, payslipsGenerated, emailsSent, errors: [] }, uploadId, summary: { totalProcessed, successful, failed, payslipsGenerated, emailsSent }, failedRecordsDownload? } }',
  },
  {
    id: 'payroll-upload-get',
    group: 'Payroll',
    method: 'GET',
    path: '/api/payroll/upload',
    title: 'Download payroll template',
    description:
      'Returns the standard payroll Excel template that HR should populate and upload.',
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
      'Downloads the Excel file containing all rows that could not be processed for a given payroll upload batch.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input: 'Path param: id = PayrollUpload.id',
    output: 'Excel file (.xlsx) of failed rows, or JSON error if not found.',
  },

  // PAYSLIP / PROFILE
  {
    id: 'profile-payslips',
    group: 'Payslip & Profile',
    method: 'GET',
    path: '/api/profile/payslips',
    title: 'Get payslip history for logged-in staff',
    description:
      'Returns all payslips belonging to the authenticated staff member for display on the profile page.',
    auth: 'Authorization: Bearer <STAFF token>',
    input: 'No body',
    output:
      'JSON: { success, message, data: { staffId, email, payslips: [ { id, month, year, grossPay, netPay, createdAt, fileName, downloadUrl } ] } }',
  },
  {
    id: 'payslip-download',
    group: 'Payslip & Profile',
    method: 'GET',
    path: '/api/payslips/[id]/download',
    title: 'Download a payslip PDF',
    description:
      'Streams a single payslip PDF. Staff can only download their own; HR and admins can download any.',
    auth: 'Authorization: Bearer <token>',
    input: 'Path param: id = Payslip.id',
    output: 'PDF file (Content-Type: application/pdf) or JSON error.',
  },
]
