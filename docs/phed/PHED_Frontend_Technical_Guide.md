# 24/7HR – PHED Payroll Module
## Frontend Integration Guide

**Version:** 1.1  
**Base URL:** `https://hrms.isurfglobal.com`  
**Module Prefix:** All PHED endpoints are under `/api/phed/`

---

## 1. Authentication

Every request must include a JWT Bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Obtain the token from `POST /api/auth/login`. The token encodes `{ userId, email, role, companyId }`.

### First-Login Password Change

When a PHED staff member logs in for the first time, the login response includes:

```json
"user": {
  "requirePasswordChange": true
}
```

**Frontend must** intercept this flag and redirect to a password-change screen before allowing navigation to any other page. Call `POST /api/auth/change-password` to fulfil this requirement. After a successful change, the flag is cleared server-side.

---

## 2. Standard Response Envelope

All JSON responses share the same wrapper:

```json
{
  "success": true | false,
  "message": "Human-readable message",
  "data": <payload> | null
}
```

| HTTP Status | Meaning |
|---|---|
| `200` | Success (GET, PUT, POST that returns existing resource) |
| `201` | Created (POST that creates a new resource) |
| `400` | Validation error — check `message` for the field |
| `401` | Invalid or missing JWT token |
| `403` | Authenticated but insufficient role |
| `404` | Resource not found |
| `409` | Conflict (duplicate unique field) |
| `429` | Rate limit exceeded — check `Retry-After` header |
| `500` | Server error |

**Error response example:**
```json
{
  "success": false,
  "message": "companyId is required",
  "data": null
}
```

---

## 3. Rate Limiting

Every endpoint is rate-limited by the client's **IP address**. Limits are per-profile and tracked in separate buckets, so exhausting the upload budget does not affect the read budget.

| Profile | Limit | Window | Applies to |
|---|:---:|:---:|---|
| `auth` | 10 req | 60 s | Login, Change Password |
| `compute` | 5 req | 15 min | POST compute |
| `upload` | 15 req | 5 min | All 5 file-upload endpoints |
| `report` | 40 req | 60 s | 8 reports + payslip PDFs + 5 templates |
| `write` | 60 req | 60 s | All POST / PUT / DELETE mutations |
| `read` | 150 req | 60 s | All GET list / detail endpoints |

### 429 response

When a limit is exceeded the server returns `HTTP 429` with:

```json
{
  "success": false,
  "message": "Too many requests. Please slow down and try again shortly.",
  "data": null
}
```

Response headers included:

| Header | Description |
|---|---|
| `Retry-After` | Seconds to wait before the next request will succeed |
| `X-RateLimit-Limit` | Maximum requests allowed in the window |
| `X-RateLimit-Remaining` | Requests remaining (`0` when this 429 was triggered) |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the window resets |

### Recommended frontend handling

```javascript
async function apiFetch(url, options) {
  const res = await fetch(url, options)

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10)
    // Show a user-friendly message:
    showToast(`Too many requests. Please wait ${retryAfter} seconds and try again.`)
    return null
  }

  return res.json()
}
```

For upload and compute buttons specifically, disable the button for the duration of `Retry-After` seconds after a 429 to prevent users from hammering the endpoint.

---

## 4. Role Permissions Matrix



| Endpoint group | STAFF | HR | ADMIN | SUPER_ADMIN |
|---|:---:|:---:|:---:|:---:|
| Configuration (grades, regions, etc.) | — | ✓ | ✓ | ✓ |
| Staff management | — | ✓ | ✓ | ✓ |
| Pay periods (create, validate, compute) | — | ✓ | ✓ | ✓ |
| Approve payroll | — | — | ✓ | ✓ |
| Reports (all) | — | ✓ | ✓ | ✓ |
| My payslips (self-service) | ✓ | ✓ | ✓ | ✓ |
| Change password | ✓ | ✓ | ✓ | ✓ |

---

## 5. Pay Period Lifecycle (State Machine)

A pay period moves through exactly these statuses in order. The frontend should use the `status` field to determine which actions to render.

```
DRAFT
  │ POST open-validation
  ▼
VALIDATION_OPEN
  │ POST close-validation
  ▼
VALIDATION_CLOSED
  │ POST compute  (can re-compute → stays in REVIEW)
  ▼
REVIEW
  │ POST approve  (ADMIN / SUPER_ADMIN only)
  ▼
APPROVED
  │ POST payslips (send emails)
  ▼
PAID
```

**Allowed actions per status:**

| Status | Available actions |
|---|---|
| `DRAFT` | Open Validation |
| `VALIDATION_OPEN` | View/upload validations, upload overtime, Close Validation |
| `VALIDATION_CLOSED` | Upload overtime (still allowed), Compute Payroll |
| `REVIEW` | View summary, view reports, Re-compute, Approve |
| `APPROVED` | Download reports, Send payslip emails, Download individual PDFs |
| `PAID` | Download reports, Re-send payslip emails, Download PDFs |

---

## 6. Configuration Endpoints

### Grades

| Method | URL | Description |
|---|---|---|
| GET | `/api/phed/grades?companyId=` | List all active grades (with allowance templates included) |
| POST | `/api/phed/grades` | Create a grade |
| PUT | `/api/phed/grades/:id` | Update a grade |
| DELETE | `/api/phed/grades/:id` | Deactivate a grade |
| GET | `/api/phed/grades/:id/allowances` | Get allowance templates for a grade |
| PUT | `/api/phed/grades/:id/allowances` | Save/replace allowance templates for a grade |

**Grade object:**
```json
{
  "id": "uuid",
  "companyId": "uuid",
  "name": "Grade Level 9",
  "code": "GL09",
  "category": "REGULAR",
  "levelOrder": 9,
  "defaultBasicSalary": 250000,
  "isActive": true,
  "allowanceTemplates": [ ... ]
}
```

**Allowance template object:**
```json
{
  "id": "uuid",
  "gradeId": "uuid",
  "allowanceType": "HOUSING",
  "valueType": "PERCENTAGE",
  "value": 40
}
```

`allowanceType` values: `HOUSING | TRANSPORT | FURNITURE | MEAL_SUBSIDY | UTILITY | LEAVE | SHIFT | OTHER`  
`valueType` values: `FIXED` (naira amount) | `PERCENTAGE` (% of basic salary)

> **How allowances compute:** A `PERCENTAGE` template with `value: 40` on a basic salary of ₦250,000 yields a housing allowance of `250,000 × 40/100 = ₦100,000`. A `FIXED` template uses the value directly.

### Regions, Feeders, Pay Points

All follow the same CRUD pattern:

| Method | URL | Body fields |
|---|---|---|
| GET | `/api/phed/regions?companyId=` | — |
| POST | `/api/phed/regions` | `{ companyId, name }` |
| PUT | `/api/phed/regions/:id` | `{ name }` |
| DELETE | `/api/phed/regions/:id` | — |

Feeders additionally accept `regionId` on create/update.

### Unions

Fixed-amount monthly deductions. A staff member can belong to multiple unions.

```json
POST /api/phed/unions
{ "companyId": "...", "name": "NUEE", "monthlyAmount": 2000 }
```

| Method | URL | Description |
|---|---|---|
| GET | `/api/phed/unions?companyId=` | List all active unions |
| POST | `/api/phed/unions` | Create a union |
| PUT | `/api/phed/unions/:id` | Update name or amount |
| DELETE | `/api/phed/unions/:id` | Deactivate |
| GET | `/api/phed/unions/:id/template` | Download Excel template for bulk member upload |
| POST | `/api/phed/unions/:id/upload` | Upload members Excel from chairman |

#### Bulk member upload

HR downloads the template, sends it to the union chairman to fill in Staff IDs, then uploads the completed file:

```
GET  /api/phed/unions/:id/template     → .xlsx download (two sheets: entry form + staff directory)
POST /api/phed/unions/:id/upload       multipart/form-data  { file: <xlsx|csv> }
```

Response:
```json
{
  "success": true,
  "message": "12 member(s) added to NUEE, 3 already member(s) skipped",
  "data": { "added": 12, "skipped": 3, "failed": 0, "errors": [] }
}
```

This is **additive** — staff already in the union are skipped (not an error). The upload does not remove any existing memberships.

### Cooperatives

Percentage-based deductions applied to gross salary. A staff member can belong to multiple cooperatives.

```json
POST /api/phed/cooperatives
{ "companyId": "...", "name": "PHED Staff Cooperative", "deductionPercentage": 5 }
```

> `deductionPercentage: 5` means 5% of the employee's gross salary is deducted each month. The API accepts values from 1–100 (whole or decimal percentages, e.g. `2.5` for 2.5%).

| Method | URL | Description |
|---|---|---|
| GET | `/api/phed/cooperatives?companyId=` | List all active cooperatives |
| POST | `/api/phed/cooperatives` | Create a cooperative |
| PUT | `/api/phed/cooperatives/:id` | Update name or percentage |
| DELETE | `/api/phed/cooperatives/:id` | Deactivate |
| GET | `/api/phed/cooperatives/:id/template` | Download Excel template for bulk member upload |
| POST | `/api/phed/cooperatives/:id/upload` | Upload members Excel from chairman |

#### Bulk member upload

Same flow as unions:

```
GET  /api/phed/cooperatives/:id/template     → .xlsx download
POST /api/phed/cooperatives/:id/upload       multipart/form-data  { file: <xlsx|csv> }
```

---

## 7. Staff Management

### List Staff (paginated)

```
GET /api/phed/staff?companyId=&page=1&limit=50&category=REGULAR&search=john
```

Returns `{ staff[], total, page, limit, pages }`.

### Create Single Staff

```
POST /api/phed/staff
```

**Required fields:** `companyId, staffId, firstName, lastName, email`  
**Optional:** `phone, category, gradeId, department, unit, regionId, feederId, payPointId, bankName, accountNumber, accountName, rsaPin, pfaName, basicSalary, annualRent, housingAllowance, transportAllowance, furnitureAllowance, mealSubsidy, utilityAllowance, leaveAllowance, shiftAllowance, otherAllowances`

> **Side effects:** Automatically creates a `staff_records` login account (role: STAFF, password: `firstname+lastname` lowercase). A branded welcome email is sent with credentials and a login link. The `requirePasswordChange` flag is set to `true`.

### Bulk Upload

```
POST /api/phed/staff/upload
Content-Type: multipart/form-data
  file: <CSV or .xlsx file>
  companyId: <uuid>
```

This is an upsert — re-uploading the same `staffId` updates the existing record rather than creating a duplicate. Login accounts and welcome emails are only sent for **newly created** staff (not updates).

Download the pre-built template first:
```
GET /api/phed/staff/template
```

### Staff Salary Override vs Grade Template

- If a staff member has `basicSalary` set directly on their record, it overrides the grade's `defaultBasicSalary`.
- Individual allowances set directly (`housingAllowance`, `transportAllowance`, etc.) override the grade's allowance templates entirely for that staff member.
- If no override exists, the system falls back to computing from the grade template.

### Unions & Cooperatives

Assignments are **incremental** — add or remove one at a time:

```
GET    /api/phed/staff/:id/unions             → list assigned unions
POST   /api/phed/staff/:id/unions             { "unionId": "uuid" }
DELETE /api/phed/staff/:id/unions             { "unionId": "uuid" }

GET    /api/phed/staff/:id/cooperatives       → list assigned cooperatives
POST   /api/phed/staff/:id/cooperatives       { "cooperativeId": "uuid" }
DELETE /api/phed/staff/:id/cooperatives       { "cooperativeId": "uuid" }
```

---

## 8. Pay Period Workflow

### Step 1 — Create Period

```
POST /api/phed/pay-periods
{ "companyId": "...", "year": 2026, "month": 4 }
```

### Step 2 — Open Validation

```
POST /api/phed/pay-periods/:id/open-validation
```

Creates one validation record per active staff member. Status → `VALIDATION_OPEN`.

### Step 3 — Submit Validations

Download the template (pre-filled with staff names and current statuses):
```
GET /api/phed/pay-periods/:id/validations/template
```

Upload completed template:
```
POST /api/phed/pay-periods/:id/validations/upload
  file: <xlsx>
```

Template columns: `Staff ID* | Full Name | Department | Category | Status* (YES/NO) | Reason`

Staff marked `NO` (NO_FOR_PAYMENT) will be **withheld** — payroll is computed but not paid.

### Step 4 — Upload Overtime (optional)

```
GET /api/phed/pay-periods/:id/overtime/template   → download pre-filled template
POST /api/phed/pay-periods/:id/overtime/upload    → upload completed file
```

Overtime column accepts decimals (e.g. `8.5` hours).  
**Formula:** `(Monthly Gross ÷ 160) × 1.5 × OT Hours`

### Step 5 — Close Validation

```
POST /api/phed/pay-periods/:id/close-validation
```

Status → `VALIDATION_CLOSED`.

### Step 6 — Compute Payroll

```
POST /api/phed/pay-periods/:id/compute
```

Runs the full payroll engine for all active staff. Status → `REVIEW`.

**What is computed:**
- All salary components (basic + allowances from grade template or staff overrides)
- Overtime earnings
- Gross salary
- Pension: 8% employee contribution, 10% employer contribution (on pensionable = basic + housing + transport)
- NHF: 2.5% of basic salary
- PAYE: NTA 2025 progressive bands after rent relief and pension deduction
- Union deductions (fixed naira amounts, summed)
- Cooperative deductions (% of gross, summed)
- Net salary = Gross − Total Deductions

### Step 7 — Review & Approve

View aggregated summary:
```
GET /api/phed/pay-periods/:id/summary
```

Download any report in `json | xlsx | pdf`:
```
GET /api/phed/pay-periods/:id/reports/bank-schedule?format=xlsx
GET /api/phed/pay-periods/:id/reports/paye?format=pdf
... (8 report types)
```

Approve (ADMIN / SUPER_ADMIN only):
```
POST /api/phed/pay-periods/:id/approve
```

Status → `APPROVED`.

### Step 8 — Send Payslips

```
POST /api/phed/pay-periods/:id/payslips
```

Sends HTML payslip emails to all ACTIVE staff. Status → `PAID`.

Download individual PDF (HR view):
```
GET /api/phed/pay-periods/:id/payslips/:staffId
```

---

## 9. Reports Reference

All report endpoints:

| Report | URL | Scope |
|---|---|---|
| Bank Payment Schedule | `/reports/bank-schedule` | ACTIVE staff only |
| Withheld Salaries | `/reports/withheld` | WITHHELD staff only |
| Pension Schedule | `/reports/pension` | ACTIVE staff |
| PAYE Schedule | `/reports/paye` | ACTIVE staff |
| ITF Schedule (1% gross) | `/reports/itf` | ACTIVE staff |
| NSITF Schedule (1% gross) | `/reports/nsitf` | ACTIVE staff |
| NHF Schedule (2.5% basic) | `/reports/nhf` | ACTIVE staff |
| Cost Centre Summary | `/reports/cost-centre` | ACTIVE, grouped by region/dept/unit |

**Format parameter:**
- `?format=json` — returns JSON array (default, for rendering in-page tables)
- `?format=xlsx` — triggers `.xlsx` file download (Content-Disposition: attachment)
- `?format=pdf` — triggers `.pdf` file download (landscape A4)

For `xlsx` and `pdf`, the browser will receive a binary response. The frontend should handle it as a blob download:

```javascript
const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
const blob = await res.blob()
const href = URL.createObjectURL(blob)
const a    = document.createElement('a')
a.href     = href
a.download = 'report.xlsx'
a.click()
URL.revokeObjectURL(href)
```

---

## 10. Employee Self-Service

Employees (role: `STAFF`) can access their own payslips:

```
GET /api/phed/my-payslips?companyId=<uuid>
```

Returns a list of pay periods with `grossSalary`, `netSalary`, `periodStatus`, and `paymentStatus`.

```
GET /api/phed/my-payslips/:payPeriodId?companyId=<uuid>
```

Downloads the employee's payslip as a branded PDF (only available for `APPROVED` or `PAID` periods).

**Identity resolution:** The backend uses the email from the JWT to look up the matching `phed_staff` record. No additional staff ID is needed — the token is sufficient.

---

## 11. NTA 2025 Tax Computation (for reference)

| Annual Chargeable Income | Rate |
|---|---|
| Up to ₦800,000 | 0% |
| ₦800,001 – ₦3,000,000 | 15% |
| ₦3,000,001 – ₦12,000,000 | 18% |
| ₦12,000,001 – ₦25,000,000 | 21% |
| ₦25,000,001 – ₦50,000,000 | 23% |
| Above ₦50,000,000 | 25% |

**Chargeable Income** = Annual Gross − Annual Pension (8%) − Rent Relief (20% of annual rent, capped ₦500,000)

**Monthly PAYE** = Annual PAYE ÷ 12

---

## 12. Key IDs to Track in the Frontend

| ID | What it identifies |
|---|---|
| `companyId` | The PHED company — required on most requests |
| `phed_staff.id` | Used in `/staff/:id`, `/staff/:id/unions`, `/payslips/:staffId` |
| `phed_pay_period.id` | Used in all pay period sub-routes |
| `phed_grade.id` | Used when assigning a grade to a staff member |
| `phed_region.id`, `feeder.id`, `payPoint.id` | Used when assigning location to staff |
| `phed_union.id`, `cooperative.id` | Used when assigning deductions to staff |

---

## 13. File Upload Requirements

| Endpoint | Accepted formats | Max recommended size |
|---|---|---|
| Staff upload | `.csv`, `.xlsx`, `.xls` | 5 MB |
| Validation upload | `.csv`, `.xlsx`, `.xls` | 2 MB |
| Overtime upload | `.csv`, `.xlsx`, `.xls` | 2 MB |

All uploads use `Content-Type: multipart/form-data`. The file field key is always `file`.
