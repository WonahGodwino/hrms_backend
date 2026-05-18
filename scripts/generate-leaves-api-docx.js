const fs = require('fs')
const path = require('path')
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} = require('docx')

const outputPath = path.join(process.cwd(), 'docs', 'LEAVES_API_FRONTEND_INTEGRATION.docx')

function heading(text, level = HeadingLevel.HEADING_2) {
  return new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } })
}

function body(text) {
  return new Paragraph({ text, spacing: { after: 80 } })
}

function codeBlock(text) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        font: 'Consolas',
        size: 20,
      }),
    ],
    spacing: { after: 120 },
  })
}

function bullet(text) {
  return new Paragraph({
    text,
    bullet: { level: 0 },
    spacing: { after: 50 },
  })
}

const endpoints = [
  {
    title: '1) GET /api/leaves/types',
    purpose: 'Returns all leave types and linked policy details accessible to the current user. Use this to populate leave type dropdowns, policy hints, and rule badges.',
    auth: 'Bearer token required. Roles: STAFF, MANAGER, HR, ADMIN, SUPER_ADMIN.',
    request: [
      'Query params:',
      '- companyId (optional): target company (validated against user access)',
      '- includeInactive (optional, default false): include disabled leave types',
      '- policyId (optional): filter by a specific leave policy',
    ],
    response: `{
  "success": true,
  "data": {
    "leaveTypes": [
      {
        "id": "lt_123",
        "name": "Vacation Leave",
        "code": "VL",
        "color": "#3B82F6",
        "isActive": true,
        "policy": {
          "id": "pol_123",
          "name": "Annual Leave",
          "maxDays": 20,
          "carryOver": 5,
          "requiresApproval": true,
          "approvalWorkflow": "MANAGER_THEN_HR"
        }
      }
    ],
    "policies": [
      {
        "id": "pol_123",
        "name": "Annual Leave",
        "maxDays": 20,
        "leaveTypesCount": 3
      }
    ]
  }
}`,
    notes: [
      'Use this endpoint first when rendering the leave application form.',
      'Cache per company and refresh when admin edits leave setup.',
      'Use approvalWorkflow and requiresApproval to show expected approval path in UI.',
    ],
  },
  {
    title: '2) GET /api/leaves/types/:id',
    purpose: 'Returns one leave type with full policy details. Useful for details drawer/modal or validation previews.',
    auth: 'Bearer token required. Roles: STAFF, MANAGER, HR, ADMIN, SUPER_ADMIN.',
    request: [
      'Path param: id (leaveTypeId)',
    ],
    response: `{
  "success": true,
  "data": {
    "leaveType": {
      "id": "lt_123",
      "name": "Sick Leave",
      "code": "SL",
      "policy": {
        "name": "Sick Leave Policy",
        "maxDays": 12,
        "documentationRequired": true,
        "allowHalfDays": true
      }
    }
  }
}`,
    notes: [
      'Frontend should handle 403 if user has no access to this company policy.',
      'Use this endpoint only when you need expanded details; list endpoint is enough for most screens.',
    ],
  },
  {
    title: '3) GET /api/leaves/my-leaves',
    purpose: 'Primary employee dashboard endpoint. Returns own leave requests and own leave balances in one response.',
    auth: 'Bearer token required. Roles: STAFF, MANAGER, HR, ADMIN, SUPER_ADMIN.',
    request: [
      'Query params:',
      '- page (optional, default 1)',
      '- limit (optional, default 20)',
      '- status (optional)',
      '- year (optional)',
      '- month (optional)',
      '- leaveTypeId (optional)',
      '- viewTeamApprovals (optional, manager-only)',
      '- staffId (optional, manager-only for direct reports)',
    ],
    response: `{
  "success": true,
  "data": {
    "leaves": [
      {
        "id": "lr_123",
        "status": "PENDING",
        "startDate": "2026-05-15T00:00:00.000Z",
        "endDate": "2026-05-19T00:00:00.000Z",
        "totalDays": 5,
        "leaveType": { "name": "Vacation Leave", "code": "VL", "color": "#3B82F6" }
      }
    ],
    "balances": [
      {
        "leaveTypeId": "lt_123",
        "totalDays": 20,
        "usedDays": 5,
        "pendingDays": 2,
        "availableDays": 13,
        "carriedOver": 0
      }
    ],
    "pagination": { "page": 1, "limit": 20, "totalCount": 3, "totalPages": 1 }
  }
}`,
    notes: [
      'This is the best single endpoint for the user leave list screen plus balance summary chips/cards.',
      'For managers, set viewTeamApprovals=true to render approval queue table.',
    ],
  },
  {
    title: '4) GET /api/leaves/balances',
    purpose: 'Returns rich balance analytics (utilization, status levels, warnings, fiscal-year context).',
    auth: 'Bearer token required. Roles: STAFF, MANAGER, HR, ADMIN, SUPER_ADMIN.',
    request: [
      'No required query params for basic usage.',
    ],
    response: `{
  "success": true,
  "data": {
    "balances": [
      {
        "leaveType": { "name": "Vacation Leave", "code": "VL" },
        "totalDays": 20,
        "usedDays": 8,
        "pendingDays": 2,
        "availableDays": 10,
        "utilizationRate": 40,
        "status": "HEALTHY"
      }
    ],
    "summary": {
      "totalEntitled": 32,
      "totalUsed": 10,
      "totalPending": 2,
      "totalAvailable": 20
    },
    "warnings": {
      "critical": 0,
      "warning": 1,
      "expiringSoon": 0,
      "messages": []
    }
  }
}`,
    notes: [
      'Use this for dedicated balance page or advanced analytics widgets.',
      'If buildMode flag appears true, treat response as non-runtime placeholder and retry in real environment.',
    ],
  },
  {
    title: '5) GET /api/leaves/summary',
    purpose: 'Returns compact stats for dashboard cards (approved/pending/rejected counts, available days, upcoming leaves).',
    auth: 'Bearer token required. Roles: STAFF, MANAGER, HR, ADMIN, SUPER_ADMIN.',
    request: [
      'No body required for GET.',
    ],
    response: `{
  "success": true,
  "data": {
    "stats": {
      "totalRequests": 7,
      "approved": 4,
      "pending": 2,
      "rejected": 1,
      "availableDays": 20
    },
    "pendingRequests": [],
    "upcomingLeaves": [],
    "summary": {
      "hasPendingRequests": false,
      "hasUpcomingLeaves": true,
      "nextLeaveDate": "2026-06-10T00:00:00.000Z"
    }
  }
}`,
    notes: [
      'This endpoint is optimized for top-of-dashboard metrics.',
      'Use together with /api/leaves/my-leaves for full request list rendering.',
    ],
  },
  {
    title: '6) POST /api/leaves/summary',
    purpose: 'Returns filtered summary for a date range or specific year.',
    auth: 'Bearer token required. Roles: STAFF, MANAGER, HR, ADMIN, SUPER_ADMIN.',
    request: [
      'JSON body:',
      '- startDate (optional, YYYY-MM-DD)',
      '- endDate (optional, YYYY-MM-DD)',
      '- year (optional)',
    ],
    response: `{
  "success": true,
  "data": {
    "stats": { "totalRequests": 3, "approved": 2, "pending": 1 },
    "filter": { "year": 2026 }
  }
}`,
    notes: [
      'Use this when dashboard has date filters that should not be handled client-side.',
    ],
  },
  {
    title: '7) GET /api/leaves',
    purpose: 'General leave request listing endpoint with role-based scope (staff own, manager team, HR/Admin company scope).',
    auth: 'Bearer token required. Roles: SUPER_ADMIN, ADMIN, HR, MANAGER, STAFF.',
    request: [
      'Query params:',
      '- page, limit, status, year, month, leaveTypeId, staffRecordId',
      '- forManagerApproval=true (manager queue)',
      '- forHRApproval=true (HR queue)',
    ],
    response: `{
  "success": true,
  "data": {
    "leaves": [
      {
        "id": "lr_123",
        "status": "PENDING",
        "currentStep": "MANAGER",
        "staffRecord": { "firstName": "John", "lastName": "Doe" },
        "leaveType": { "name": "Vacation Leave", "policy": { "approvalWorkflow": "MANAGER_THEN_HR" } }
      }
    ],
    "pagination": { "page": 1, "limit": 20, "totalCount": 18, "totalPages": 1 }
  }
}`,
    notes: [
      'Use this endpoint for admin/manager operational tables where cross-user visibility is needed.',
    ],
  },
  {
    title: '8) POST /api/leaves/apply',
    purpose: 'Submit a leave application and trigger policy validation, balance checks, and approval workflow selection.',
    auth: 'Bearer token required. Roles: STAFF, MANAGER, HR, ADMIN, SUPER_ADMIN.',
    request: [
      'JSON body:',
      '- leaveTypeId (required)',
      '- startDate, endDate (required, YYYY-MM-DD)',
      '- reason (required)',
      '- emergencyContact, contactPhone (optional)',
      '- handoverTo, handoverNotes (optional)',
      '- attachmentUrl, fileName (optional)',
      '- isHalfDay, halfDayPart (optional)',
      '- medicalCertificateNumber/date/issuer (optional, required by policy for some types)',
      '- staffRecordId (optional, for apply-on-behalf scenarios)',
    ],
    response: `{
  "success": true,
  "message": "Leave application submitted successfully",
  "data": {
    "leaveRequest": {
      "id": "lr_123",
      "status": "PENDING",
      "currentStep": "MANAGER",
      "totalDays": 3
    },
    "policy": {
      "approvalWorkflow": "MANAGER_THEN_HR",
      "requiresApproval": true
    },
    "nextSteps": [
      "Waiting for manager approval"
    ]
  }
}`,
    notes: [
      'Frontend should show policy validation errors directly to user (notice period, docs required, maxDays, etc.).',
    ],
  },
  {
    title: '9) PATCH /api/leaves/:id/manager-approve',
    purpose: 'Manager approval action for pending requests at manager step.',
    auth: 'Bearer token required. Roles: MANAGER, HR, ADMIN, SUPER_ADMIN.',
    request: [
      'Path param: id (leaveRequestId)',
      'JSON body:',
      '- action: APPROVE or REJECT',
      '- comments: required when action = REJECT',
    ],
    response: `{
  "success": true,
  "message": "Leave request approved by manager. Awaiting HR/Admin approval.",
  "data": {
    "id": "lr_123",
    "status": "MANAGER_APPROVED",
    "currentStep": "HR"
  }
}`,
    notes: [
      'If workflow is manager-only, status can move directly to APPROVED and balance is moved from pending to used.',
    ],
  },
  {
    title: '10) PATCH /api/leaves/:id/hr-approve',
    purpose: 'Final HR/Admin approval action for requests in HR step.',
    auth: 'Bearer token required. Roles: HR, ADMIN, SUPER_ADMIN.',
    request: [
      'Path param: id (leaveRequestId)',
      'JSON body:',
      '- action: APPROVE or REJECT',
      '- comments: required when action = REJECT',
    ],
    response: `{
  "success": true,
  "message": "Leave request approved by HR/Admin successfully",
  "data": {
    "id": "lr_123",
    "status": "APPROVED",
    "currentStep": "COMPLETED"
  }
}`,
    notes: [
      'On approve, backend updates leave balance usedDays and pendingDays.',
    ],
  },
  {
    title: '11) GET /api/leaves/admin',
    purpose: 'Admin operational endpoint for HR/Admin/Super Admin management views.',
    auth: 'Bearer token required. Roles: HR, ADMIN, SUPER_ADMIN.',
    request: [
      'Query params include page/limit/status/currentStep/year/month/leaveTypeId/companyId/department/staffName/staffId plus pending queue flags.',
    ],
    response: `{
  "success": true,
  "data": {
    "leaves": [],
    "summary": {
      "pendingManagerApprovals": 0,
      "pendingHRApprovals": 0,
      "totalPending": 0,
      "totalApproved": 0,
      "totalRejected": 0
    },
    "pagination": { "page": 1, "limit": 20, "totalCount": 0, "totalPages": 0 }
  }
}`,
    notes: [
      'Use this endpoint for HR/Admin consoles, not for regular employee self-service pages.',
    ],
  },
  {
    title: '12) GET /api/leaves/upload?action=template&companyId=...&format=excel|csv',
    purpose: 'Downloads leave bulk-upload template file.',
    auth: 'Bearer token required. Roles: HR, SUPER_ADMIN, ADMIN.',
    request: [
      'Query params:',
      '- action=template',
      '- companyId (required)',
      '- format (optional: excel default or csv)',
    ],
    response: 'Binary file response (.xlsx or .csv) with sheet templates and sample records.',
    notes: [
      'Set responseType/blob handling on frontend when downloading.',
    ],
  },
  {
    title: '13) POST /api/leaves/upload',
    purpose: 'Processes leave setup bulk upload (leave types, policies, holidays, blackout periods).',
    auth: 'Bearer token required. Roles: HR, SUPER_ADMIN, ADMIN.',
    request: [
      'multipart/form-data:',
      '- file (required: .xlsx/.xls/.csv)',
      '- companyId (required)',
    ],
    response: `{
  "success": true,
  "data": {
    "summary": {
      "uploadId": "upl_123",
      "hasFailedRecords": true,
      "downloadFailedUrl": "/api/leaves/upload?action=failed&uploadId=upl_123&format=excel",
      "totalProcessed": { "leaveTypes": 10, "policies": 5, "holidays": 7, "blackoutPeriods": 2 },
      "successful": { "leaveTypes": 8, "policies": 5, "holidays": 6, "blackoutPeriods": 2 },
      "failed": { "leaveTypes": 2, "policies": 0, "holidays": 1, "blackoutPeriods": 0 }
    },
    "details": {
      "leaveTypes": { "created": 4, "updated": 4, "failed": 2, "errors": [] },
      "policies": { "created": 2, "updated": 3, "failed": 0, "errors": [] }
    }
  }
}`,
    notes: [
      'Show category-level results by section to help user resolve upload issues quickly.',
    ],
  },
  {
    title: '14) GET /api/leaves/upload/:id/failed',
    purpose: 'Returns failed upload report and diagnostics for one upload batch.',
    auth: 'Bearer token required. Roles: HR, SUPER_ADMIN, ADMIN, MANAGER (access controlled by company assignment rules).',
    request: [
      'Path param: id (uploadId)',
    ],
    response: `{
  "success": true,
  "data": {
    "uploadId": "upl_123",
    "status": "COMPLETED_WITH_ERRORS",
    "summary": {
      "leaveTypes": { "failed": 2 },
      "holidays": { "failed": 1 }
    },
    "failedByType": {
      "leaveTypes": [],
      "policies": [],
      "holidays": [],
      "blackoutPeriods": []
    }
  }
}`,
    notes: [
      'Useful for rendering post-upload remediation UI and report details.',
    ],
  },
]

const children = []

children.push(
  new Paragraph({
    text: 'Leaves API Frontend Integration Guide',
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  })
)

children.push(body('Version: 1.0'))
children.push(body(`Generated: ${new Date().toISOString()}`))
children.push(body('Audience: Frontend engineers integrating leave request, leave type and policy, and leave balance features.'))

children.push(heading('Global Integration Rules', HeadingLevel.HEADING_1))
children.push(bullet('Base path: /api/leaves'))
children.push(bullet('Authentication: Send Authorization header with Bearer token on all endpoints.'))
children.push(bullet('CORS: OPTIONS handlers exist for preflight.'))
children.push(bullet('Dates: Use ISO date strings for request payloads. Most response dates are ISO timestamps.'))
children.push(bullet('Decimal fields: Backend may return numeric values derived from database decimals. Treat as number on UI.'))
children.push(bullet('Error shape: Most endpoints return success=false with message and optionally details. Handle 400, 401, 403, 404, and 500 explicitly in UI.'))

children.push(heading('Recommended UI Data Flow', HeadingLevel.HEADING_1))
children.push(bullet('Leave request page: GET /api/leaves/types then POST /api/leaves/apply.'))
children.push(bullet('My leaves page: GET /api/leaves/my-leaves (includes balances).'))
children.push(bullet('Balance analytics page: GET /api/leaves/balances.'))
children.push(bullet('Dashboard cards: GET /api/leaves/summary.'))
children.push(bullet('Manager queue: GET /api/leaves?forManagerApproval=true or GET /api/leaves/my-leaves?viewTeamApprovals=true.'))
children.push(bullet('HR queue: GET /api/leaves?forHRApproval=true and PATCH /api/leaves/:id/hr-approve.'))

children.push(heading('Endpoint Reference', HeadingLevel.HEADING_1))

for (const ep of endpoints) {
  children.push(heading(ep.title, HeadingLevel.HEADING_2))
  children.push(body(`Purpose: ${ep.purpose}`))
  children.push(body(`Auth: ${ep.auth}`))

  children.push(heading('Request', HeadingLevel.HEADING_3))
  for (const line of ep.request) {
    children.push(body(line))
  }

  children.push(heading('Response Example', HeadingLevel.HEADING_3))
  children.push(codeBlock(ep.response))

  children.push(heading('Frontend Notes', HeadingLevel.HEADING_3))
  for (const note of ep.notes) {
    children.push(bullet(note))
  }
}

children.push(heading('Standard Error Handling (Frontend)', HeadingLevel.HEADING_1))
children.push(bullet('400: Validation or bad request. Show inline form errors where possible.'))
children.push(bullet('401: Missing or invalid token. Redirect to login and clear stale session.'))
children.push(bullet('403: User lacks scope for company or record. Show permission state.'))
children.push(bullet('404: Record not found or no data available. Show empty-state guidance.'))
children.push(bullet('500 or 503: Server or database issue. Show retry action and fallback messaging.'))

children.push(heading('Implementation Checklist', HeadingLevel.HEADING_1))
children.push(bullet('Use typed API client models for leave type, policy, leave request, and balances.'))
children.push(bullet('Centralize token header injection and 401 handling in HTTP client interceptor.'))
children.push(bullet('Normalize date strings in one utility before rendering in UI.'))
children.push(bullet('Implement optimistic UI carefully for approvals only if rollback is supported.'))
children.push(bullet('Show category-level results for bulk upload success and failed counts.'))

const doc = new Document({
  creator: 'GitHub Copilot',
  title: 'Leaves API Frontend Integration Guide',
  description: 'Detailed request and response integration guide for leaves endpoints.',
  sections: [{ children }],
})

Packer.toBuffer(doc)
  .then((buffer) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, buffer)
    process.stdout.write(`DOCX generated: ${outputPath}\n`)
  })
  .catch((err) => {
    console.error('Failed to generate DOCX:', err)
    process.exit(1)
  })
