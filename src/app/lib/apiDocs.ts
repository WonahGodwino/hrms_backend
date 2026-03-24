// src/app/lib/apiDocs.ts

export type ApiDoc = {
  id: string
  group: 'Auth' | 'Staff' | 'Payroll' | 'Payslip & Profile' | 'Leaves' | 'Company' | 'Admin'
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  title: string
  description: string
  auth?: string
  input?: string
  output?: string
  sample?: any
  contentType?: 'json' | 'form-data' | 'file' // Add file for direct file downloads
  deprecated?: boolean
  alternative?: string
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
    sample: {
      email: "staff@company.com",
      firstName: "John",
      lastName: "Doe",
      role: "STAFF",
      department: "Engineering",
      position: "Software Developer"
    }
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
      'JSON: { success, message, data: { token, user: { id, staffId?, email, firstName, lastName, department, position, role, companyId } } }',
    sample: {
      staffId: "EMP001",
      email: "john.doe@company.com",
      password: "securepassword123"
    }
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
    sample: {
      email: "admin@company.com",
      password: "adminpassword123"
    }
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
      'JSON: { success, message, data: { user: { id, staffId?, email, firstName, lastName, role, companyId }, company?: { id, companyName, email, phone } } }'
  },

  // ======================
  // COMPANY
  // ======================

  {
    id: 'company-register',
    group: 'Company',
    method: 'POST',
    path: '/api/companies/register',
    title: 'Register new company',
    description:
      'SUPER_ADMIN only. Creates a new company and initializes default AI settings.',
    auth: 'Authorization: Bearer <SUPER_ADMIN token>',
    input:
      'JSON body: { companyName, address?, phone?, email?, logo?, taxId? }',
    output:
      'JSON: { success, message, data: { company: { id, companyName, email, phone, address, taxId, createdAt } } }',
    sample: {
      companyName: "Acme Corporation",
      address: "123 Business St, City, Country",
      phone: "+1234567890",
      email: "contact@acme.com",
      taxId: "TAX123456"
    }
  },

  {
    id: 'company-list',
    group: 'Company',
    method: 'GET',
    path: '/api/companies',
    title: 'List companies',
    description:
      'SUPER_ADMIN only. Returns paginated list of all registered companies.',
    auth: 'Authorization: Bearer <SUPER_ADMIN token>',
    input: 'Optional query: page, pageSize, search',
    output:
      'JSON: { success, message, data: { companies: [ { id, companyName, email, phone, taxId, createdAt, archived } ], pagination: { page, pageSize, total, totalPages } } }'
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
      'HR uploads staff master data from Excel to create or update StaffRecord rows for the current company. The company is taken from the JWT (companyId). Supports Excel (.xlsx) files only.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input: 'multipart/form-data: file = .xlsx staff template',
    output:
      'JSON: { success, message, data: { uploadId, companyId, summary: { totalRecords, successful, failed }, errors?: [ { rowNumber, message } ] } }',
    contentType: 'form-data'
  },

  {
    id: 'staff-template',
    group: 'Staff',
    method: 'GET',
    path: '/api/staff/template',
    title: 'Download Staff Upload Template',
    description: 'Download an Excel template for bulk staff upload. Contains required columns and validation rules.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input: 'No body',
    output: 'Excel file (.xlsx) with staff upload template',
    contentType: 'file'
  },

  {
    id: 'staff-records',
    group: 'Staff',
    method: 'GET',
    path: '/api/staff/records',
    title: 'List staff records',
    description:
      'Returns a paginated list of staff records for the authenticated user\'s company. Multi-company aware via JWT companyId.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input: 'Optional query: page, pageSize, search, department, isActive',
    output:
      'JSON: { success, message, data: { companyId, items: [ { id, staffId, firstName, lastName, email, department, position, phone?, bankName?, accountNumber?, isActive, managerId, createdAt } ], pagination: { page, pageSize, total, totalPages } } }'
  },

  {
    id: 'staff-record-detail',
    group: 'Staff',
    method: 'GET',
    path: '/api/staff/records/[id]',
    title: 'Get staff record by ID',
    description:
      'Returns detailed information about a specific staff member. Access restricted to same company.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN | MANAGER>',
    input: 'Path param: id = StaffRecord.id',
    output:
      'JSON: { success, message, data: { id, staffId, firstName, lastName, email, department, position, phone, bankName, accountNumber, isActive, manager, company, createdAt, updatedAt } }'
  },

  {
    id: 'staff-create',
    group: 'Staff',
    method: 'POST',
    path: '/api/staff/records',
    title: 'Create single staff record',
    description:
      'Create a single staff record manually. Alternative to bulk upload.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input:
      'JSON body: { staffId, firstName, lastName, email, department?, position?, phone?, bankName?, accountNumber?, managerId? }',
    output:
      'JSON: { success, message, data: { id, staffId, firstName, lastName, email, department, position, isActive } }',
    sample: {
      staffId: "EMP002",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane.smith@company.com",
      department: "Marketing",
      position: "Marketing Manager",
      phone: "+123456789",
      bankName: "Bank of America",
      accountNumber: "1234567890"
    }
  },

  {
    id: 'staff-update',
    group: 'Staff',
    method: 'PUT',
    path: '/api/staff/records/[id]',
    title: 'Update staff record',
    description:
      'Update an existing staff record. Only HR/Admin can update, staff can update limited fields.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN | STAFF>',
    input:
      'JSON body: { firstName?, lastName?, department?, position?, phone?, bankName?, accountNumber?, isActive? }',
    output:
      'JSON: { success, message, data: { id, staffId, firstName, lastName, email, department, position, isActive, updatedAt } }',
    sample: {
      firstName: "Jane",
      lastName: "Johnson",
      position: "Senior Marketing Manager"
    }
  },

  // ======================
  // LEAVES
  // ======================

  {
    id: 'leaves-apply',
    group: 'Leaves',
    method: 'POST',
    path: '/api/leaves/apply',
    title: 'Apply for leave',
    description:
      'Submit a new leave application. Validates against company policy, checks balance, and initiates approval workflow. Supports half-day, medical certificates, and handover. HR/Admin can apply on behalf of others.',
    auth: 'Authorization: Bearer <STAFF | HR | SUPER_ADMIN | MANAGER token>',
    input:
      'JSON body: { leaveTypeId, startDate, endDate, reason, emergencyContact?, contactPhone?, handoverTo?, handoverNotes?, attachmentUrl?, fileName?, isHalfDay?, halfDayPart?, medicalCertificateNumber?, medicalCertificateDate?, medicalCertificateIssuer?, staffRecordId? (HR only) }',
    output:
      'JSON: { success, message, data: { leaveRequestId, referenceNumber, status, currentStep, requestedDays, leaveType, policyApplied, leaveBalance, workWeekInfo, nextSteps, approvers, notifications, warnings, importantNotes, additionalInfo } }',
    sample: {
      leaveTypeId: "cuid123",
      startDate: "2026-02-15",
      endDate: "2026-02-20",
      reason: "Annual leave for vacation",
      emergencyContact: "+1234567890",
      contactPhone: "+1234567890",
      isHalfDay: false
    }
  },

  {
    id: 'leaves-list',
    group: 'Leaves',
    method: 'GET',
    path: '/api/leaves',
    title: 'List leave requests',
    description:
      'Get paginated list of leave requests. Role-based filtering: STAFF sees own leaves, MANAGER sees team leaves, HR sees company leaves.',
    auth: 'Authorization: Bearer <token>',
    input: 'Optional query: page, limit, status, year, month, leaveTypeId, staffRecordId, forManagerApproval, forHRApproval',
    output:
      'JSON: { success, message, data: { leaves: [ { id, referenceNumber, staffRecord, leaveType, startDate, endDate, totalDays, status, currentStep, ... } ], statistics: { pendingManagerApprovals, pendingHRApprovals, approvedThisMonth, rejectedThisMonth, teamOnLeave }, pagination: { page, limit, totalCount, totalPages } } }'
  },

  {
    id: 'leaves-get',
    group: 'Leaves',
    method: 'GET',
    path: '/api/leaves/apply',
    title: 'Get leave request by ID',
    description:
      'Retrieve detailed information about a specific leave request including approval history and notifications.',
    auth: 'Authorization: Bearer <token>',
    input: 'Query param: id = LeaveRequest.id',
    output:
      'JSON: { success, message, data: { leaveRequest, staff, leaveBalance, notifications } }'
  },

  {
    id: 'leaves-approve',
    group: 'Leaves',
    method: 'PUT',
    path: '/api/leaves/apply',
    title: 'Approve/Reject/Cancel leave',
    description:
      'Update leave request status. MANAGER can approve/reject when at MANAGER step. HR can approve/reject when at HR step. Staff can cancel pending requests.',
    auth: 'Authorization: Bearer <MANAGER | HR | SUPER_ADMIN | STAFF>',
    input:
      'JSON body: { leaveRequestId, action ("APPROVE" | "REJECT" | "CANCEL"), comments? }',
    output:
      'JSON: { success, message, data: { leaveRequest, balanceUpdates, actionPerformedBy } }',
    sample: {
      leaveRequestId: "cuid123",
      action: "APPROVE",
      comments: "Approved by manager"
    }
  },

  {
    id: 'leaves-balances',
    group: 'Leaves',
    method: 'GET',
    path: '/api/leaves/balances',
    title: 'Get leave balances',
    description:
      'Get leave balances for a staff member. Auto-initializes missing balance records. Shows total, used, pending, and available days per leave type.',
    auth: 'Authorization: Bearer <STAFF | HR | SUPER_ADMIN | MANAGER token>',
    input: 'Optional query: year, staffRecordId (HR only)',
    output:
      'JSON: { success, message, data: { staffId, staffName, staffEmail, company, year, balances: [ { leaveTypeId, leaveTypeName, leaveTypeCode, leaveTypeColor, policy, totalDays, usedDays, pendingDays, carriedOver, availableDays, year } ], summary: { totalLeaveDays, totalUsedDays, totalPendingDays, totalAvailableDays } } }'
  },

  {
    id: 'leaves-types',
    group: 'Leaves',
    method: 'GET',
    path: '/api/leaves/types',
    title: 'Get leave types',
    description:
      'Get all active leave types for the current company with their policies and colors.',
    auth: 'Authorization: Bearer <token>',
    input: 'No body',
    output:
      'JSON: { success, message, data: [ { id, name, code, color, isActive, policy: { id, name, maxDays, noticePeriod, isPaid, requiresApproval, approvalWorkflow } } ] }'
  },

  // ======================
  // PAYROLL
  // ======================

  {
    id: 'payroll-upload',
    group: 'Payroll',
    method: 'POST',
    path: '/api/payroll/upload',
    title: 'Upload payroll and generate payslips',
    description:
      'HR uploads payroll Excel/CSV for one company. System parses rows, creates/updates Payroll entries, generates payslip PDFs (Payslip table), optionally sends notification emails, and records failed rows in PayrollUpload. Multi-company aware via JWT companyId.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input: 'multipart/form-data: file = .xlsx or .csv payroll file, sendEmails = "true" | "false" (optional)',
    output:
      'JSON: { success, message, data: { uploadId, summary: { totalProcessed, successful, failed, payslipsGenerated, payslipsUpdated, emailsSent, emailAttempts, emailFailures }, failedRecordsCount, downloadLinks: { failedRecords }, filePaths: { original, processed } } }',
    contentType: 'form-data'
  },

  {
    id: 'payroll-template',
    group: 'Payroll',
    method: 'GET',
    path: '/api/payroll/template',
    title: 'Download payroll template',
    description:
      'Returns the standard payroll Excel template that HR should populate and upload for the current company.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input: 'No body',
    output: 'Excel file (.xlsx)',
    contentType: 'file'
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
    contentType: 'file'
  },

  {
    id: 'payroll-history',
    group: 'Payroll',
    method: 'GET',
    path: '/api/payroll/history',
    title: 'Get payroll upload history',
    description:
      'Returns a list of all payroll uploads for the current company with their processing results.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input: 'Optional query: page, pageSize',
    output:
      'JSON: { success, message, data: { uploads: [ { id, fileName, totalRecords, successful, failed, createdAt } ], pagination: { page, pageSize, total } } }'
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
    input: 'Optional query: year, month',
    output:
      'JSON: { success, message, data: { staffId, email, companyId, payslips: [ { id, payrollId, month, year, grossPay, netPay, createdAt, fileName, downloadUrl } ] } }'
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
    contentType: 'file'
  },

  {
    id: 'payslip-view',
    group: 'Payslip & Profile',
    method: 'GET',
    path: '/api/payslips/[id]',
    title: 'Get payslip details',
    description:
      'Returns details about a specific payslip including file information and payroll data.',
    auth: 'Authorization: Bearer <token>',
    input: 'Path param: id = Payslip.id',
    output:
      'JSON: { success, message, data: { id, fileName, filePath, month, year, grossPay, netPay, createdAt, staff: { id, staffId, firstName, lastName } } }'
  },

  // ======================
  // ADMIN
  // ======================

  {
    id: 'admin-company-stats',
    group: 'Admin',
    method: 'GET',
    path: '/api/admin/companies/[id]/stats',
    title: 'Get company statistics',
    description:
      'SUPER_ADMIN only. Returns statistics for a specific company including staff count, active leave requests, payroll summaries, etc.',
    auth: 'Authorization: Bearer <SUPER_ADMIN token>',
    input: 'Path param: id = Company.id, Optional query: year',
    output:
      'JSON: { success, message, data: { company: { id, name, email, createdAt }, stats: { totalStaff, activeStaff, pendingLeaves, approvedLeavesThisMonth, totalPayrollProcessed, totalPayslipsGenerated } } }'
  },

  {
    id: 'admin-system-health',
    group: 'Admin',
    method: 'GET',
    path: '/api/admin/health',
    title: 'System health check',
    description:
      'SUPER_ADMIN only. Returns system health status including database connection, disk space, and service status.',
    auth: 'Authorization: Bearer <SUPER_ADMIN token>',
    input: 'No body',
    output:
      'JSON: { success, message, data: { status: "healthy" | "degraded", timestamp, services: { database: "connected" | "disconnected", storage: "available" | "low", email: "operational" | "issues" } } }'
  },

  // ======================
  // DEPRECATED ENDPOINTS
  // ======================

  {
    id: 'leaves-deprecated-post',
    group: 'Leaves',
    method: 'POST',
    path: '/api/leaves',
    title: '[DEPRECATED] Create leave request',
    description:
      'This endpoint is deprecated. Please use /api/leaves/apply instead. The new endpoint provides better validation, policy checking, and notification features.',
    auth: 'Authorization: Bearer <token>',
    input: 'JSON body',
    output: '410 Gone - Please use /api/leaves/apply',
    deprecated: true,
    alternative: '/api/leaves/apply'
  }
]