# Training & Certification Module — Frontend Integration Guide

> **Audience:** Frontend engineers integrating the 247HR Training & Certification module.
> **Base URL:** `https://api.247hr.com` (or `http://localhost:3000` locally).
> **Auth:** Every request requires `Authorization: Bearer <jwt>`.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Authentication & Roles](#2-authentication--roles)
3. [Response Format](#3-response-format)
4. [API Reference Summary](#4-api-reference-summary)
5. [Training Programs](#5-training-programs)
6. [Training Sessions](#6-training-sessions)
7. [Assessments & Questions](#7-assessments--questions)
8. [Assessment Attempts (Staff Flow)](#8-assessment-attempts-staff-flow)
9. [Certifications](#9-certifications)
10. [Certification Types & Templates](#10-certification-types--templates)
11. [Assignment Rules](#11-assignment-rules)
12. [Analytics](#12-analytics)
13. [Data Models & Enums](#13-data-models--enums)
14. [Error Handling](#14-error-handling)
15. [Pagination](#15-pagination)
16. [CSV Export Pattern](#16-csv-export-pattern)
17. [Key Workflows](#17-key-workflows)

---

## 1. Architecture Overview

The module is broken into seven functional areas:

```
Training Programs ──── Sessions
        │
        ├── Participants (progress tracking)
        ├── Assessments ── Questions
        │         └── Attempts (staff takes quiz)
        │
        └── Assignment Rules (auto-enroll logic)

Certifications ──── Certification Types ── Templates
        └── Documents (renewal uploads)

Analytics (cross-cutting, read-only)
Audit Logs (cross-cutting, read-only)
```

All data is company-scoped. Every API call is automatically filtered by the `companyId` embedded in the JWT. You never need to validate ownership on the frontend.

---

## 2. Authentication & Roles

### Token

All requests must include:

```
Authorization: Bearer <token>
```

### Role Capabilities

| Role | Can Do |
|------|--------|
| STAFF | View programs, view own certifications, take assessments |
| MANAGER | View programs, view participants (read-only) |
| HR | Full CRUD on programs, sessions, assessments, certifications, rules |
| ADMIN | HR permissions + soft-delete programs/assessments, archive |
| SUPER_ADMIN | All of the above |

> STAFF can only see their own certification records and cannot access admin-only analytics endpoints.

---

## 3. Response Format

All endpoints return a consistent envelope:

```json
{
  "success": true,
  "message": "Training program created",
  "data": { ... }
}
```

Error responses:

```json
{
  "success": false,
  "message": "programName, category, trainingType are required",
  "errors": []
}
```

Paginated responses include:

```json
{
  "success": true,
  "data": {
    "programs": [...],
    "total": 87,
    "page": 1,
    "limit": 20,
    "pages": 5
  }
}
```

---

## 4. API Reference Summary

| Group | Endpoint | Methods |
|-------|----------|---------|
| Programs | `/api/training-programs` | GET, POST |
| Programs | `/api/training-programs/:id` | GET, PUT, DELETE |
| Programs | `/api/training-programs/:id/publish` | PATCH, POST |
| Programs | `/api/training-programs/:id/archive` | PATCH, POST |
| Programs | `/api/training-programs/:id/reminders` | POST |
| Programs | `/api/training-programs/dashboard-stats` | GET |
| Programs | `/api/training-programs/import` | POST |
| Participants | `/api/training-programs/:id/participants` | GET |
| Participants | `/api/training-programs/:id/participants/:employeeId` | GET |
| Participants | `/api/training-programs/:id/participants/kpis` | GET |
| Participants | `/api/training-programs/:id/participants/export` | GET |
| Assignments | `/api/training-programs/:id/assignments` | POST |
| Assignments | `/api/training-programs/:id/assignments/:employeeId` | DELETE |
| Sessions | `/api/training-sessions` | GET, POST |
| Sessions | `/api/training-sessions/:id` | GET, PUT, DELETE |
| Sessions | `/api/training-sessions/:id/cancel` | PATCH, POST |
| Sessions | `/api/training-sessions/:id/reschedule` | PATCH |
| Sessions | `/api/training-sessions/upcoming` | GET |
| Assessments | `/api/assessments` | GET, POST |
| Assessments | `/api/assessments/:id` | GET, PUT, DELETE |
| Assessments | `/api/assessments/:id/publish` | PATCH, POST |
| Assessments | `/api/assessments/:id/archive` | PATCH, POST |
| Assessments | `/api/assessments/:id/analytics` | GET |
| Assessments | `/api/assessments/:id/my-attempts` | GET |
| Questions | `/api/assessments/:id/questions` | GET, POST |
| Questions | `/api/assessments/:id/questions/:qid` | PUT, DELETE |
| Questions | `/api/assessments/:id/questions/reorder` | PATCH |
| Attempts | `/api/assessments/:id/attempts` | GET (admin), POST (staff) |
| Attempts | `/api/attempts/:attemptId` | GET |
| Attempts | `/api/attempts/:attemptId/submit` | PUT, POST |
| Attempts | `/api/attempts/:attemptId/review` | GET (admin) |
| Attempts | `/api/attempts/:attemptId/allow-retake` | PATCH, POST |
| Certifications | `/api/certifications` | GET, POST |
| Certifications | `/api/certifications/:id` | GET, PUT |
| Certifications | `/api/certifications/:id/renew` | POST |
| Certifications | `/api/certifications/expiring` | GET |
| Certifications | `/api/certifications/kpis` | GET |
| Certifications | `/api/certifications/export` | POST |
| Certifications | `/api/certifications/audit` | GET |
| Certifications | `/api/certifications/bulk/:action` | POST |
| Cert Types | `/api/certification-types` | GET, POST |
| Cert Templates | `/api/certification-templates` | GET, POST |
| Cert Templates | `/api/certification-templates/:id` | PUT |
| Rules | `/api/assignment-rules` | GET, POST |
| Rules | `/api/assignment-rules/:id` | PUT, DELETE |
| Rules | `/api/assignment-rules/:id/toggle` | POST |
| Rules | `/api/assignment-rules/activity-log` | GET |
| Analytics | `/api/analytics/training` | GET |
| Analytics | `/api/analytics/training/dashboard` | GET |
| Analytics | `/api/analytics/training/trends` | GET |
| Analytics | `/api/analytics/training/compliance` | GET |
| Analytics | `/api/analytics/training/activity` | GET |
| Analytics | `/api/analytics/training/completion-rate` | GET |
| Analytics | `/api/analytics/training/progress` | GET |
| Analytics | `/api/analytics/certifications/compliance` | GET |
| Analytics | `/api/analytics/certifications/departments` | GET |
| Analytics | `/api/analytics/certifications/risk` | GET |
| Analytics | `/api/analytics/certifications/trends` | GET |

---

## 5. Training Programs

### List Programs

```
GET /api/training-programs
```

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | `DRAFT` \| `ACTIVE` \| `ARCHIVED` |
| `category` | string | Free text filter |
| `training_type` | string | `Online` \| `In-Person` \| `Hybrid` |
| `level` | string | `Beginner` \| `Intermediate` \| `Advanced` |
| `search` | string | Searches `programName` |
| `sort` | string | `createdAt` (default) \| `name` |
| `page` | int | Default 1 |
| `limit` | int | Default 20, max 100 |

**Response `data`:**

```json
{
  "programs": [
    {
      "id": "uuid",
      "slug": "fire-safety-training-2026-1746000000000",
      "programName": "Fire Safety Training 2026",
      "category": "Safety",
      "trainingType": "Online",
      "status": "ACTIVE",
      "startDate": "2026-05-01T00:00:00.000Z",
      "endDate": "2026-05-31T00:00:00.000Z",
      "dueDate": "2026-05-31T00:00:00.000Z",
      "trainer": "John Doe",
      "passingScore": 80,
      "assessment": { "id": "...", "name": "...", "type": "Quiz", "status": "ACTIVE" },
      "_count": { "participants": 42, "sessions": 3 }
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20,
  "pages": 1
}
```

### Create Program

```
POST /api/training-programs
Content-Type: application/json
```

**Required fields:** `programName`, `category`, `trainingType`, `description`, `trainer`, `startDate`, `endDate`, `dueDate`

**Validation rules:**
- `endDate` must be on or after `startDate`
- `dueDate` must be on or before `endDate`
- Dates can be ISO strings (`"2026-05-31"` or `"2026-05-31T00:00:00Z"`)

**Full body:**

```json
{
  "companyId": "optional — inferred from token",
  "programName": "Fire Safety Training 2026",
  "category": "Safety",
  "trainingType": "Online",
  "description": "Annual fire safety compliance training.",
  "level": "Beginner",
  "departments": ["Operations", "Facilities"],
  "trainer": "John Doe",
  "durationHours": 4,
  "sessionType": "Single",
  "startDate": "2026-05-01",
  "endDate": "2026-05-31",
  "dueDate": "2026-05-31",
  "location": "Online (LMS)",
  "maxParticipants": 200,
  "assessmentRequired": true,
  "assessmentType": "Quiz",
  "passingScore": 80,
  "maxAttempts": 3,
  "autoCertificate": true,
  "assignmentMethod": "Automatic Enrollment",
  "notifyEmployees": true,
  "status": "DRAFT"
}
```

**Response:** `201` with the created program object.

### Get Program Detail

```
GET /api/training-programs/:idOrSlug
```

Returns full program including nested `sessions`, `materials`, `assessment` (with questions for admins), and computed `stats`:

```json
{
  "stats": {
    "totalEnrolled": 42,
    "completed": 28,
    "inProgress": 10,
    "notStarted": 4,
    "completionRate": 67
  }
}
```

> The `:id` parameter accepts both the UUID and the human-readable slug.

### Publish a Program

```
PATCH /api/training-programs/:id/publish
```

Optional body: `{ "notify_employees": true }` — if true, sends in-app notifications to all enrolled participants.

Transitions: `DRAFT → ACTIVE`. Returns `409` if already active.

### Archive a Program

```
PATCH /api/training-programs/:id/archive
```

Transitions: `ACTIVE → ARCHIVED`. Requires ADMIN or SUPER_ADMIN.

### Bulk Import (CSV upload flow)

The frontend parses the CSV file client-side, then POSTs the records array:

```
POST /api/training-programs/import
Content-Type: application/json
```

```json
{
  "records": [
    {
      "programName": "OSHA 30-Hour",
      "category": "Safety",
      "trainingType": "Online",
      "description": "...",
      "trainer": "Alice",
      "startDate": "2026-06-01",
      "endDate": "2026-06-30",
      "dueDate": "2026-06-30"
    }
  ]
}
```

**Response:**

```json
{
  "data": {
    "imported": 1,
    "skipped": 0,
    "errors": []
  }
}
```

Errors include `{ row: 2, message: "Missing: trainer" }` for each invalid row. Valid rows are still imported even if some fail.

---

## 6. Training Sessions

### List & Filter

```
GET /api/training-sessions?program_id=&status=Upcoming&date_from=2026-05-01&date_to=2026-05-31
```

### Create Session

```
POST /api/training-sessions
```

Required: `trainingProgramId`, `title`, `date`, `type`. The `trainingProgramId` must belong to the same company (validated server-side).

```json
{
  "trainingProgramId": "program-uuid",
  "title": "Session 1 — Introduction",
  "date": "2026-05-10",
  "time": "09:00",
  "type": "Online",
  "trainer": "John Doe",
  "capacity": 50,
  "location": "Zoom",
  "duration": "2 hours",
  "summary": "Overview of fire safety."
}
```

### Cancel vs. Reschedule

- **Cancel:** `PATCH /api/training-sessions/:id/cancel` — sets status to `Cancelled`.
- **Reschedule:** `PATCH /api/training-sessions/:id/reschedule` with `{ date, time? }` — resets status to `Upcoming`. Returns `400` on already-cancelled sessions.

### Upcoming Widget

```
GET /api/training-sessions/upcoming?limit=5
```

Returns the next 5 sessions sorted by date. Good for a homepage dashboard card.

---

## 7. Assessments & Questions

### Assessment Lifecycle

```
DRAFT  →  ACTIVE  →  ARCHIVED
```

An assessment must have at least one question before it can be published.

### Create Assessment

```
POST /api/assessments
```

Required: `name`, `type`, `passingScore`.

```json
{
  "trainingProgramId": "program-uuid",
  "name": "Fire Safety Quiz",
  "type": "Quiz",
  "timeLimitMinutes": 30,
  "passingScore": 80,
  "maxAttempts": 3,
  "shuffleQuestions": false
}
```

### Adding Questions

```
POST /api/assessments/:id/questions
```

**Multiple choice:**

```json
{
  "title": "Fire extinguisher class",
  "type": "multiple-choice",
  "prompt": "Which class handles electrical fires?",
  "options": [
    { "id": "opt-a", "text": "Class A" },
    { "id": "opt-b", "text": "Class B" },
    { "id": "opt-c", "text": "Class C" }
  ],
  "correctOptionId": "opt-c",
  "explanation": "Class C is for electrical fires.",
  "points": 10,
  "difficulty": "medium",
  "required": true,
  "shuffleAnswers": true
}
```

**True/False:**

```json
{
  "type": "true-false",
  "prompt": "Water can be used on electrical fires.",
  "options": [
    { "id": "opt-true",  "text": "True" },
    { "id": "opt-false", "text": "False" }
  ],
  "correctBoolean": "false",
  "points": 5
}
```

> `correctBoolean` is a **string** (`"true"` or `"false"`), not a JSON boolean. This is how the server stores and compares it.

### Reorder Questions

```
PATCH /api/assessments/:id/questions/reorder
```

```json
[
  { "id": "q-uuid-1", "order": 1 },
  { "id": "q-uuid-2", "order": 2 },
  { "id": "q-uuid-3", "order": 3 }
]
```

Send the complete desired ordering as an array. Executed atomically.

### Correct Answers — Security Note

Correct answers (`correctOptionId`, `correctBoolean`, `explanation`) are **never returned** to STAFF in any endpoint. Only HR/ADMIN see them in:
- `GET /api/assessments/:id` (as admin)
- `GET /api/assessments/:id/questions` (as admin)
- `GET /api/attempts/:id/review` (review mode)

Do not attempt to surface correct answers to the quiz UI — the server never sends them during active attempts.

---

## 8. Assessment Attempts (Staff Flow)

This is the complete flow for an employee taking a quiz:

### Step 1 — Check previous attempts

```
GET /api/assessments/:id/my-attempts
```

Response tells you:
- `assessment.maxAttempts` — how many total attempts allowed
- `attempts[]` — past attempts with `outcome`, `score`, `retakeAllowed`
- If the last attempt has `retakeAllowed: true`, the employee can start one more attempt even if they hit the limit

**Use this to decide whether to show the "Start Assessment" button.**

### Step 2 — Start attempt

```
POST /api/assessments/:id/attempts
```

Returns:

```json
{
  "attemptId": "uuid",
  "attemptNumber": 2,
  "questions": [
    {
      "id": "q-uuid",
      "order": 1,
      "type": "multiple-choice",
      "prompt": "Which class handles electrical fires?",
      "options": [
        { "id": "opt-a", "text": "Class A" },
        { "id": "opt-c", "text": "Class C" }
      ],
      "points": 10,
      "required": true
    }
  ]
}
```

> Questions have NO `correctOptionId` or `correctBoolean`. Do not expect them.

If `shuffleQuestions: true`, questions arrive in randomized order.
If `shuffleAnswers: true` on a question, shuffle the `options` array before rendering.

**Rate limited:** 10 attempt starts per minute per user. Handle `429` responses gracefully.

### Step 3 — Track time (client-side)

Start a timer when the attempt begins. If `assessment.timeLimitMinutes` is set, auto-submit when the timer expires.

### Step 4 — Submit

```
PUT /api/attempts/:attemptId/submit
```

```json
{
  "time_taken_seconds": 720,
  "responses": [
    {
      "question_id": "q-uuid-1",
      "selected_option_id": "opt-c",
      "time_spent_seconds": 45
    },
    {
      "question_id": "q-uuid-2",
      "selected_boolean": "false",
      "time_spent_seconds": 20
    }
  ]
}
```

For true/false questions, send `selected_boolean: "true"` or `"false"` (string).
For multiple choice, send `selected_option_id`.

**Response:**

```json
{
  "data": {
    "score": 85,
    "outcome": "Passed",
    "passed": true
  }
}
```

On pass, the server automatically updates the participant's `trainingStatus → COMPLETED` and `progressPct → 100`.

### Retake Flow (Admin grants)

1. Admin sees a failed attempt in the participant detail.
2. Admin calls `PATCH /api/attempts/:attemptId/allow-retake`.
3. Employee's `my-attempts` now shows `retakeAllowed: true`.
4. Employee can start a new attempt.

---

## 9. Certifications

### List with Filters

```
GET /api/certifications
```

Key filters:

| Param | Description |
|-------|-------------|
| `status` | `Valid` \| `Expiring Soon` \| `Expired` \| `Pending` |
| `criticalOnly=true` | Only records expiring within 7 days |
| `department` | Filter by employee department |
| `authority` | Filter by certification authority (e.g. `OSHA`) |
| `dateFrom` / `dateTo` | Filter by `issueDate` range |

Each record includes a computed `daysToExpiry` field (null if no expiry date).

> STAFF automatically only see their own records. No filter needed.

### Issue Certifications

```
POST /api/certifications
```

Accepts an array of records — all issued atomically:

```json
{
  "records": [
    {
      "employeeId": "emp-uuid",
      "certificationTypeId": "type-uuid",
      "issueDate": "2026-05-01",
      "expiryDate": "2027-05-01",
      "certIdNumber": "CERT-2026-001"
    }
  ]
}
```

Status defaults to `Pending`. Update to `Valid` via PUT after verification.

### Renew Certification

```
POST /api/certifications/:id/renew
```

```json
{
  "newExpiryDate": "2028-05-01",
  "issueDate": "2026-05-01",
  "certIdNumber": "CERT-2027-001",
  "documentUrl": "https://storage.example.com/cert.pdf",
  "documentName": "Renewal Certificate"
}
```

Sets status → `Valid`, recomputes `daysToExpiry`. If `documentUrl` is provided, creates a linked document record.

### Expiring Soon Widget

```
GET /api/certifications/expiring?days_threshold=30&critical_only=false
```

For a dashboard alert banner, use `critical_only=true` to show only certificates expiring within 7 days.

### Certification KPIs

```
GET /api/certifications/kpis
```

```json
{
  "total": 120,
  "valid":        { "count": 90,  "pct": 75 },
  "expiringSoon": { "count": 15,  "pct": 12 },
  "expired":      { "count": 10,  "pct": 8  },
  "pending":      { "count": 5,   "pct": 4  }
}
```

### Bulk Actions

```
POST /api/certifications/bulk/:action
```

Actions:
- `remind` — sends renewal reminder notifications
- `expire-update` — recalculates and updates status for each record
- `archive` — marks selected records as `Expired`

Max 500 record IDs per request.

### CSV Export

```
POST /api/certifications/export
{ "format": "csv", "scope": "all" }
```

For a selected subset:

```json
{
  "format": "csv",
  "scope": "selected",
  "certification_ids": ["id1", "id2"]
}
```

See [CSV Export Pattern](#16-csv-export-pattern) for how to trigger the download.

---

## 10. Certification Types & Templates

### Types

Certification Types define the category of certification (e.g. "OSHA 30-Hour", "First Aid"). Each type has a `name`, `type` field (e.g. Safety, Professional), an `authority` (e.g. OSHA), and optionally links to a template.

```
GET  /api/certification-types          — list all (needed for the "Issue Cert" dropdown)
POST /api/certification-types          — create new type (ADMIN+)
```

### Templates

Templates define the visual layout of the printed/PDF certificate. `fieldsSchema` is a free-form JSON object — the frontend renders it using its own PDF/certificate generation logic.

```
GET  /api/certification-templates      — list templates (used in type creation form)
POST /api/certification-templates      — create template
PUT  /api/certification-templates/:id  — update template
```

Example `fieldsSchema`:

```json
{
  "header": "Certificate of Completion",
  "logo": true,
  "signatureLine": true,
  "fields": ["employeeName", "certificationName", "issueDate", "expiryDate", "authority"]
}
```

---

## 11. Assignment Rules

Assignment rules define automatic enrollment conditions.

### Create Rule

```
POST /api/assignment-rules
```

```json
{
  "name": "Auto-assign Safety Training to Engineering",
  "ruleType": "department",
  "trigger": "OnHire",
  "condition": { "department": "Engineering" },
  "trainingProgramId": "program-uuid",
  "graceDays": 7,
  "priority": "High",
  "scope": "Engineering Department",
  "notifyOnAssignment": true,
  "escalateManager": true,
  "preExpiryNotifications": [30, 14, 7]
}
```

### Toggle Enable/Disable

```
POST /api/assignment-rules/:id/toggle
```

No body needed. Returns the updated rule with the flipped `enabled` value.

### Activity Log

```
GET /api/assignment-rules/activity-log?rule_id=:id
```

Shows all audit events scoped to `entityType: "assignment_rule"`.

---

## 12. Analytics

All analytics endpoints require HR/ADMIN/SUPER_ADMIN and accept `?companyId=`.

### Training Overview (Main Dashboard)

```
GET /api/analytics/training
```

Full response shape:

```json
{
  "programs":   { "total": 12, "active": 8, "byCategory": [...] },
  "participants": {
    "total": 240, "completed": 160, "inProgress": 50,
    "notStarted": 30, "completionRate": 67, "byStatus": [...]
  },
  "certifications": { "total": 120, "valid": 90, "expiringSoon": 15, "expired": 10 },
  "assessments": { "total": 8, "passed": 130, "failed": 40, "passRate": 76 },
  "recentActivity": [...]
}
```

### Lightweight Dashboard

```
GET /api/analytics/training/dashboard
```

Same KPIs but lighter — use for the main page summary cards. Includes last 5 audit log entries as `recentActivity`.

### Certification Compliance

```
GET /api/analytics/certifications/compliance
```

Returns overall `complianceRate` and a department-level breakdown:

```json
{
  "kpis": { "total": 120, "valid": 90, ... },
  "complianceRate": 75,
  "byDepartment": [
    { "department": "Engineering", "total": 30, "compliant": 25, "complianceRate": 83 }
  ]
}
```

---

## 13. Data Models & Enums

### Program Status

```
DRAFT → ACTIVE → ARCHIVED
```

### Training Status (Participant)

```
NOT STARTED → IN PROGRESS → COMPLETED
```

### Certification Status

```
Pending → Valid → Expiring Soon → Expired
```

### Assessment Status

```
DRAFT → ACTIVE → ARCHIVED
```

### Attempt Outcome

```
Pending → Passed | Failed
```

### Session Status

```
Upcoming → Completed | Cancelled
```

### Question Types

| Value | Description |
|-------|-------------|
| `multiple-choice` | Single correct option from `options[]` |
| `true-false` | Boolean — `correctBoolean` is `"true"` or `"false"` (string) |

### Difficulty Levels

`easy` | `medium` | `hard`

### Training Type

`Online` | `In-Person` | `Hybrid`

---

## 14. Error Handling

| HTTP | Meaning | Action |
|------|---------|--------|
| 400 | Missing or invalid field | Show field-level error |
| 401 | Invalid/missing token | Redirect to login |
| 403 | Insufficient role | Show "Not authorized" |
| 404 | Resource not found | Show empty state |
| 409 | Conflict (already in that state) | Show info toast |
| 422 | Validation error (cross-field) | Show specific message from `data.message` |
| 429 | Rate limited | Show "Please wait and try again" |
| 500 | Server error | Show generic error, log to Sentry |

Always read `data.message` from the response for user-facing error text.

---

## 15. Pagination

Every list endpoint supports:

```
?page=1&limit=20
```

Response always includes:

```json
{ "total": 87, "page": 2, "limit": 20, "pages": 5 }
```

Build a generic `usePagination` hook and reuse it across all list pages.

---

## 16. CSV Export Pattern

The CSV endpoints return a file attachment, not JSON. The browser must receive the `Authorization` header, which rules out a plain `<a href>`. Use this pattern:

```js
async function downloadCsv(url, body) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = 'export.csv';
  a.click();
  URL.revokeObjectURL(href);
}

// Usage:
downloadCsv('/api/certifications/export', {
  format: 'csv',
  scope: 'all',
});
```

For GET-based CSV exports (participants export):

```js
async function downloadGetCsv(url) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = 'participants.csv';
  a.click();
  URL.revokeObjectURL(href);
}

// Usage:
downloadGetCsv(`/api/training-programs/${programId}/participants/export?format=csv`);
```

---

## 17. Key Workflows

### Create and Launch a Training Program

```
1. POST /api/training-programs           → get programId
2. POST /api/training-sessions           → add sessions
3. POST /api/assessments                 → get assessmentId
4. POST /api/assessments/:id/questions   → add questions (repeat)
5. PATCH /api/assessments/:id/publish    → activate assessment
6. POST /api/training-programs/:id/assignments  → enroll employees
7. PATCH /api/training-programs/:id/publish     → go ACTIVE (optionally notify)
```

### Employee Takes Assessment

```
1. GET  /api/assessments/:id/my-attempts   → check attempt eligibility
2. POST /api/assessments/:id/attempts      → start (get attemptId + questions)
3. [Employee answers questions — client-side only]
4. PUT  /api/attempts/:attemptId/submit    → score + outcome
5. GET  /api/assessments/:id/my-attempts   → confirm result stored
```

### Manage Expiring Certifications

```
1. GET  /api/certifications/expiring?days_threshold=30
2. [HR reviews list, selects records]
3. POST /api/certifications/bulk/remind     → send notifications
4. [Employee renews, HR updates]
5. POST /api/certifications/:id/renew      → extend expiry
6. POST /api/certifications/bulk/expire-update → recalculate statuses
```

### Grant an Assessment Retake

```
1. GET  /api/assessments/:id/attempts?employee_id=xxx
2. PATCH /api/attempts/:attemptId/allow-retake
3. [Employee sees retakeAllowed=true in my-attempts]
4. Employee retakes: POST /api/assessments/:id/attempts
```

### Send Bulk Reminders

```
POST /api/training-programs/:id/reminders
{ "employee_ids": [], "message": "Custom message" }
```

Leave `employee_ids` empty to remind all NOT STARTED and IN PROGRESS participants.

---

*Guide version: 2026-04-30 | Backend commit: `26c99f1`*
