// src/app/lib/apiDocs.ts

export type ApiDoc = {
  id: string
  group: 'Auth' | 'Staff' | 'Payroll' | 'Dynamic Payroll' | 'Payslip & Profile' | 'Leaves' | 'Company' | 'Admin'
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  title: string
  description: string
  auth?: string
  input?: string
  output?: string
  sample?: any
  contentType?: 'json' | 'form-data' | 'file'
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
    path: '/api/auth/companies/register',
    title: 'Register new company',
    description:
      'SUPER_ADMIN only. Creates a new company and initializes default AI settings.',
    auth: 'Authorization: Bearer <SUPER_ADMIN token>',
    input:
      'JSON body: { companyName, address?, phone?, email?, logo?, taxId?, baseCurrency? (ISO 4217, e.g. NGN, USD, EUR) }',
    output:
      'JSON: { success, message, data: { company: { id, companyName, email, phone, address, taxId, baseCurrency, createdAt } } }',
    sample: {
      companyName: "Acme Corporation",
      address: "123 Business St, City, Country",
      phone: "+1234567890",
      email: "contact@acme.com",
      taxId: "TAX123456",
      baseCurrency: "NGN"
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

  {
    id: 'company-accessible',
    group: 'Company',
    method: 'GET',
    path: '/api/companies/accessible',
    title: 'Get accessible companies',
    description:
      'Returns list of companies the current user has access to based on their role and assignments.',
    auth: 'Authorization: Bearer <token>',
    input: 'No body',
    output:
      'JSON: { success, message, data: [ { id, companyName, email, phone, address, taxId, logo, baseCurrency, currencySymbol } ] }'
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
  // DYNAMIC PAYROLL TEMPLATES
  // ======================

  {
    id: 'dynamic-templates-list',
    group: 'Dynamic Payroll',
    method: 'GET',
    path: '/api/payroll/template/dynamic',
    title: 'List dynamic payroll templates',
    description:
      'Returns all templates for a company. Includes system templates (ISURF_STANDARD, BLUERIDGE) when includeSystem=true. Shows usage counts for each template.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN | ADMIN token>',
    input: 'Query params: companyId (required), includeSystem (optional, default false)',
    output:
      'JSON: { success, message, data: [ { id, companyId, templateName, isSystem, sections, fields, _count: { payrolls, payrollData }, createdAt, updatedAt } ] }',
    sample: {
      companyId: "company_123",
      includeSystem: "true"
    }
  },

  {
    id: 'dynamic-template-get',
    group: 'Dynamic Payroll',
    method: 'GET',
    path: '/api/payroll/template/dynamic/[id]',
    title: 'Get single dynamic template',
    description:
      'Returns complete template details including all fields and sections. Access restricted to company owners or system templates.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN | ADMIN token>',
    input: 'Path param: id = Template.id, Query param: companyId',
    output:
      'JSON: { success, message, data: { id, companyId, templateName, sections, isSystem, fields: [ { id, displayName, systemField, dataType, required, aliases, showOnPayslip, order } ], createdAt, updatedAt } }'
  },

  {
    id: 'dynamic-template-create',
    group: 'Dynamic Payroll',
    method: 'POST',
    path: '/api/payroll/template/dynamic',
    title: 'Create dynamic payroll template',
    description:
      'Creates a new custom payroll template for a company. Supports sections: STAFF_DETAILS, FIXED_EARNINGS, FIXED_VALUE, EARNINGS, DEDUCTIONS. Each section can have multiple fields with custom properties.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN | ADMIN token>',
    input: 'JSON body with template structure',
    output:
      'JSON: { success, message, data: { id, companyId, templateName, sections, fields, createdAt } }',
    sample: {
      companyId: "company_123",
      templateName: "Executive Compensation Package",
      isSystem: false,
      sections: {
        STAFF_DETAILS: [
          { displayName: "Employee ID", systemField: "employee_id", dataType: "Text", required: true, showOnPayslip: false },
          { displayName: "Full Name", systemField: "full_name", dataType: "Text", required: true, showOnPayslip: false },
          { displayName: "Email", systemField: "email", dataType: "Text", required: true, showOnPayslip: false }
        ],
        FIXED_EARNINGS: [
          { displayName: "Basic Salary", systemField: "basic_salary", dataType: "Number", required: true, showOnPayslip: true },
          { displayName: "Housing Allowance", systemField: "housing_allowance", dataType: "Number", required: true, showOnPayslip: true }
        ],
        FIXED_VALUE: [
          { displayName: "Loan Code", systemField: "loan_code", dataType: "Text", required: false, showOnPayslip: true }
        ],
        EARNINGS: [
          { displayName: "Performance Bonus", systemField: "performance_bonus", dataType: "Number", required: false, showOnPayslip: true }
        ],
        DEDUCTIONS: [
          { displayName: "PAYE Tax", systemField: "paye_tax", dataType: "Number", required: true, showOnPayslip: true },
          { displayName: "Pension", systemField: "pension", dataType: "Number", required: true, showOnPayslip: true }
        ]
      }
    }
  },

  {
    id: 'dynamic-template-update',
    group: 'Dynamic Payroll',
    method: 'PUT',
    path: '/api/payroll/templates/dynamic',
    title: 'Update dynamic payroll template',
    description:
      'Updates an existing template. Replaces all fields with new definitions. Cannot update templates that are in use.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN | ADMIN token>',
    input: 'JSON body: { templateId, templateName?, sections? }',
    output:
      'JSON: { success, message, data: { id, templateName, sections, fields, updatedAt } }',
    sample: {
      templateId: "cm8n3k5qk0003gklj4h7y8z9y",
      templateName: "Executive Compensation Package v2",
      sections: {
        STAFF_DETAILS: [
          { displayName: "Employee ID", systemField: "employee_id", dataType: "Text", required: true, showOnPayslip: false },
          { displayName: "Full Name", systemField: "full_name", dataType: "Text", required: true, showOnPayslip: false }
        ],
        FIXED_EARNINGS: [
          { displayName: "Basic Salary", systemField: "basic_salary", dataType: "Number", required: true, showOnPayslip: true }
        ],
        FIXED_VALUE: [],
        EARNINGS: [],
        DEDUCTIONS: [
          { displayName: "PAYE Tax", systemField: "paye_tax", dataType: "Number", required: true, showOnPayslip: true }
        ]
      }
    }
  },

  {
    id: 'dynamic-template-delete',
    group: 'Dynamic Payroll',
    method: 'DELETE',
    path: '/api/payroll/templates/dynamic',
    title: 'Delete dynamic payroll template',
    description:
      'Deletes a template. Cannot delete templates that have been used in payroll processing (have payroll records).',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN | ADMIN token>',
    input: 'Query param: templateId',
    output: 'JSON: { success, message, data: null }'
  },

  {
    id: 'dynamic-template-download',
    group: 'Dynamic Payroll',
    method: 'GET',
    path: '/api/payroll/template/dynamic/download',
    title: 'Download dynamic payroll template',
    description:
      'Downloads the template as Excel or CSV file with all fields, sample data, and instructions. Includes all sections with required field markers (*).',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN | ADMIN token>',
    input: 'Query params: templateId (required), companyId (required), format (excel | csv, default excel)',
    output: 'Excel (.xlsx) or CSV file with template structure',
    contentType: 'file'
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
      'HR uploads payroll Excel/CSV for one company. Supports both fixed templates (ISURF_STANDARD, BLUERIDGE) and dynamic templates. System parses rows, creates/updates Payroll entries, generates payslip PDFs, optionally sends notification emails, and records failed rows in PayrollUpload.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input: 'multipart/form-data: file = .xlsx or .csv payroll file, companyId, sendEmails = "true" | "false", templateType (for fixed), templateId (for dynamic)',
    output:
      'JSON: { success, message, data: { uploadId, templateType, templateId, templateName, summary: { totalProcessed, successful, failed, payslipsGenerated, payslipsUpdated, emailsSent, emailAttempts, emailFailures, processingTimeMs }, failedRecordsCount, downloadLinks: { failedRecords, original }, filePaths: { original, processed } } }',
    contentType: 'form-data'
  },

  {
    id: 'payroll-template-fixed',
    group: 'Payroll',
    method: 'GET',
    path: '/api/payroll/template',
    title: 'Download fixed payroll template',
    description:
      '[DEPRECATED] Returns the standard ISURF payroll Excel template. Use dynamic templates endpoint instead.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input: 'No body',
    output: 'Excel file (.xlsx)',
    contentType: 'file',
    deprecated: true,
    alternative: '/api/payroll/template/dynamic/download'
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
      'JSON: { success, message, data: { uploads: [ { id, fileName, totalRecords, successful, failed, createdAt, templateType, templateName } ], pagination: { page, pageSize, total } } }'
  },

  {
    id: 'admin-dashboard-cards',
    group: 'Admin',
    method: 'GET',
    path: '/api/admin/dashboard/cards',
    title: 'Get dashboard cards (HR/ADMIN/SUPER_ADMIN)',
    description:
      'Returns the 4 dashboard card metrics: myCompanies, totalStaff, payslipsThisMonth, and hrManagers. For HR/ADMIN, myCompanies reflects assigned companies. For SUPER_ADMIN, myCompanies reflects all active companies. Optional companyId scopes other card metrics to one accessible company.',
    auth: 'Authorization: Bearer <HR | ADMIN | SUPER_ADMIN token>',
    input: 'Optional query: year, month, companyId',
    output:
      'JSON: { success, message, data: { period: { year, month }, companyContext: { role, myCompanies, selectedCompanyId, scopedCompanyIds, currency, currencySymbol }, cards: { myCompanies, totalStaff, payslipsThisMonth, hrManagers, currency, currencySymbol } } }',
    sample: {
      year: '2026',
      month: '4',
      companyId: 'company_123'
    }
  },

  {
    id: 'payroll-salary-summary-admin',
    group: 'Payroll',
    method: 'GET',
    path: '/api/admin/dashboard/reporting/salary-summary',
    title: 'Get salary summary analytics (HR/ADMIN/SUPER_ADMIN)',
    description:
      'Returns salary statistics for paid months only, aggregated both per staff and per month. Supports period filtering by monthly, quarterly, and yearly. HR is restricted to one assigned company. ADMIN can select one assigned company using companyId (defaults to first assigned when omitted). SUPER_ADMIN can query all companies or a selected company.',
    auth: 'Authorization: Bearer <HR | ADMIN | SUPER_ADMIN token>',
    input: 'Optional query: companyId, period (monthly|quarterly|yearly), year, month (for monthly), quarter (for quarterly), staffRecordId',
    output:
      'JSON: { success, message, data: { filters: { companyId, requestedCompanyId, period, year, month?, quarter?, staffRecordId? }, companyContext: { role, accessibleCompanies: [ { companyId, companyName } ], selectedCompanyId }, perMonth: [ { month, year, totalBasePay, totalGrossPay, totalNetSalary, totalTax, totalPension, totalBonus, staffCount } ], perStaff: [ { staffRecordId, staffId, staffName, department, position, monthsPaid, totalBasePay, totalGrossPay, totalNetSalary, totalTax, totalPension, totalBonus } ], summary: { totalBasePay, totalGrossPay, totalNetSalary, totalTax, totalPension, totalBonus }, metrics: { monthsCovered, staffCovered, currency, currencySymbol? } } }',
    sample: {
      period: "quarterly",
      year: "2026",
      quarter: "2",
      companyId: "company_123"
    }
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
      'Returns all payslips belonging to the authenticated staff member. Includes template information (type, name) and optional detailed breakdown of earnings/deductions. Supports dynamic templates with custom fields.',
    auth: 'Authorization: Bearer <STAFF | HR | SUPER_ADMIN token>',
    input: 'Optional query: year, month, page, limit, includeDetails (true/false), minAmount, maxAmount, startDate, endDate',
    output:
      'JSON: { success, message, data: { staff, payslips: [ { id, month, year, grossPay, netPay, createdAt, fileName, downloadUrl, templateType, templateName, isDynamic, earningsBreakdown?, deductionsBreakdown?, totals? } ], summary: { totalPayslips, totalGrossPay, totalNetPay, earliestPayslip, latestPayslip }, availableYears: [], pagination } }',
    sample: {
      includeDetails: "true",
      year: "2024",
      month: "March"
    }
  },

  {
    id: 'profile-salary-summary',
    group: 'Payslip & Profile',
    method: 'GET',
    path: '/api/profile/salary-summary',
    title: 'Get monthly salary summary for logged-in staff',
    description:
      'STAFF-only endpoint for dashboard salary cards. Returns one consolidated record per month/year (latest payslip per month), includes only paid/processed payroll months, supports both standard and dynamic templates, and aggregates totals for gross pay, net salary, and tax.',
    auth: 'Authorization: Bearer <STAFF token>',
    input: 'Optional query: year, fromYear, toYear. If year is provided it takes precedence; otherwise fromYear/toYear are used as inclusive range filters.',
    output:
      'JSON: { success, message, data: { monthly: [ { month, year, basePay, grossPay, netPay, totalTax, pension, bonus, templateType } ], summary: { totalGrossPay, totalNetSalary, totalTax }, metrics: { monthsPaid, currency, currencySymbol } } }. Common errors: 401 missing/invalid token, 403 non-STAFF role, 400 missing company context.',
    sample: {
      year: "2026",
      fromYear: "2025",
      toYear: "2026"
    }
  },

  {
    id: 'payslip-download',
    group: 'Payslip & Profile',
    method: 'GET',
    path: '/api/payslips/[id]/download',
    title: 'Download a payslip PDF',
    description:
      'Streams a single payslip PDF. Staff can only download their own payslips for their company; HR/SUPER_ADMIN can download any payslip within their company. Returns enhanced headers with payslip metadata including template info.',
    auth: 'Authorization: Bearer <token>',
    input: 'Path param: id = Payslip.id',
    output:
      'PDF file with headers: X-Payslip-Info (JSON), X-Payslip-Details (base64), Content-Disposition',
    contentType: 'file'
  },

  {
    id: 'payslip-view',
    group: 'Payslip & Profile',
    method: 'GET',
    path: '/api/payslips/[id]',
    title: 'Get payslip details',
    description:
      'Returns details about a specific payslip including file information, payroll data, and template info.',
    auth: 'Authorization: Bearer <token>',
    input: 'Path param: id = Payslip.id',
    output:
      'JSON: { success, message, data: { id, fileName, filePath, month, year, grossPay, netPay, createdAt, templateType, templateName, isDynamic, staff: { id, staffId, firstName, lastName, department, position } } }'
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

  {
    id: 'admin-seed-templates',
    group: 'Admin',
    method: 'POST',
    path: '/api/admin/seed-templates',
    title: 'Seed system payroll templates',
    description:
      'SUPER_ADMIN only. Seeds the database with system templates (ISURF_STANDARD, BLUERIDGE) if they don\'t exist. Can force update with --force flag.',
    auth: 'Authorization: Bearer <SUPER_ADMIN token>',
    input: 'Optional query: force (true/false)',
    output:
      'JSON: { success, message, data: { created, existing, failed } }'
  },

  {
    id: 'admin-currency-catalog',
    group: 'Admin',
    method: 'GET',
    path: '/api/admin/settings/currencies',
    title: 'List supported currencies',
    description:
      'Returns internationally supported currency options for dropdowns, including code, name, and display symbol.',
    auth: 'Authorization: Bearer <HR | ADMIN | SUPER_ADMIN token>',
    input: 'No body',
    output:
      'JSON: { success, message, data: { currencies: [ { code, name, symbol } ], total } }'
  },

  {
    id: 'admin-company-base-currency',
    group: 'Admin',
    method: 'GET',
    path: '/api/admin/settings/currency',
    title: 'Get company base currency',
    description:
      'Returns the company base currency used for money display (payslips, dashboards, reports). HR/ADMIN are scoped to assigned companies. SUPER_ADMIN can specify companyId.',
    auth: 'Authorization: Bearer <HR | ADMIN | SUPER_ADMIN token>',
    input: 'Optional query: companyId (required for SUPER_ADMIN when managing multiple companies)',
    output:
      'JSON: { success, message, data: { companyId, companyName, baseCurrency, currencySymbol, updatedAt } }'
  },

  {
    id: 'admin-company-base-currency-update',
    group: 'Admin',
    method: 'PUT',
    path: '/api/admin/settings/currency',
    title: 'Set company base currency',
    description:
      'Updates company base currency. Money views should use this value to format all currency symbols consistently.',
    auth: 'Authorization: Bearer <HR | ADMIN | SUPER_ADMIN token>',
    input: 'JSON body: { baseCurrency, companyId? } (companyId required for SUPER_ADMIN when managing multiple companies)',
    output:
      'JSON: { success, message, data: { companyId, companyName, baseCurrency, currencySymbol, updatedAt } }',
    sample: {
      baseCurrency: 'USD',
      companyId: 'company_123'
    }
  },

  {
    id: 'admin-exchange-rates-list',
    group: 'Admin',
    method: 'GET',
    path: '/api/admin/settings/exchange-rates',
    title: 'List saved exchange rates',
    description:
      'Returns company-saved FX rates used for business conversions. Defaults baseCurrency to company base currency.',
    auth: 'Authorization: Bearer <HR | ADMIN | SUPER_ADMIN token>',
    input: 'Optional query: companyId, baseCurrency',
    output:
      'JSON: { success, message, data: { companyId, companyName, baseCurrency, baseCurrencySymbol, rates: [ { id, pair, baseCurrency, quoteCurrency, quoteCurrencySymbol, rate, source, fetchedAt, updatedAt } ] } }'
  },

  {
    id: 'admin-exchange-rates-save',
    group: 'Admin',
    method: 'POST',
    path: '/api/admin/settings/exchange-rates',
    title: 'Create or update exchange rate',
    description:
      'Saves manual FX rate or fetches and saves live FX rate for a currency pair. Upserts per company/base/quote pair.',
    auth: 'Authorization: Bearer <HR | ADMIN | SUPER_ADMIN token>',
    input: 'JSON body: { quoteCurrency, rate?, fetchLive?, baseCurrency?, companyId? }',
    output:
      'JSON: { success, message, data: { id, companyId, companyName, pair, baseCurrency, quoteCurrency, rate, source, fetchedAt, updatedAt } }',
    sample: {
      baseCurrency: 'NGN',
      quoteCurrency: 'EUR',
      fetchLive: true,
      companyId: 'company_123'
    }
  },

  {
    id: 'admin-exchange-rates-live',
    group: 'Admin',
    method: 'GET',
    path: '/api/admin/settings/exchange-rates/live',
    title: 'Fetch live exchange rate',
    description:
      'Fetches live FX quote for a base/quote pair without saving it, useful for the Fetch Live button.',
    auth: 'Authorization: Bearer <HR | ADMIN | SUPER_ADMIN token>',
    input: 'Query: quoteCurrency (required), baseCurrency?, companyId?',
    output:
      'JSON: { success, message, data: { companyId, companyName, baseCurrency, baseCurrencySymbol, quoteCurrency, quoteCurrencySymbol, pair, rate, source, asOf } }'
  },

  // ======================
  // DEPRECATED ENDPOINTS
  // ======================

  {
    id: 'payroll-template-old',
    group: 'Payroll',
    method: 'GET',
    path: '/api/payroll/template',
    title: '[DEPRECATED] Download fixed payroll template',
    description:
      'This endpoint is deprecated. Please use the dynamic template system with /api/payroll/templates/dynamic/download instead.',
    auth: 'Authorization: Bearer <HR | SUPER_ADMIN token>',
    input: 'No body',
    output: 'Excel file (.xlsx)',
    contentType: 'file',
    deprecated: true,
    alternative: '/api/payroll/template/dynamic/download'
  },

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
