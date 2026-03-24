# Payroll Engine API - Frontend Integration Guide

## Base URL
```
/api/engine
```

## Authentication
All endpoints require a Bearer token in the Authorization header:
```javascript
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}
```

---

## Common Issues & Solutions

### 1. Getting HTML Instead of JSON

**Problem:** API returns HTML (404 page) instead of JSON response.

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Wrong endpoint path | Use `/api/engine/...` NOT `/api/payroll-engine/...` |
| Missing dynamic segment | Ensure IDs are included: `/api/engine/pay-periods/123` not `/api/engine/pay-periods/` |
| Trailing slash issues | Remove trailing slashes: `/api/engine/pay-periods` not `/api/engine/pay-periods/` |

**Frontend Fix:**
```javascript
// BAD - Will return 404 HTML
const response = await fetch('/api/payroll-engine/pay-periods')

// GOOD - Correct endpoint
const response = await fetch('/api/engine/pay-periods')
```

### 2. 304 Not Modified Responses

**Problem:** Getting 304 status with empty body.

**Cause:** Browser caching previous responses.

**Frontend Fix:**
```javascript
// Add cache-busting headers
const response = await fetch('/api/engine/pay-periods', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
})

// Or add timestamp to URL
const response = await fetch(`/api/engine/pay-periods?_t=${Date.now()}`)
```

### 3. CORS Errors

**Problem:** CORS policy blocking requests.

**Frontend Fix:**
```javascript
// Ensure credentials are included
const response = await fetch('/api/engine/pay-periods', {
  method: 'GET',
  credentials: 'include', // Important for cookies
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
```

### 4. 401 Unauthorized

**Problem:** Getting unauthorized errors.

**Causes:**
- Missing `Authorization` header
- Token expired
- Token format incorrect

**Frontend Fix:**
```javascript
// Check token exists before request
if (!token) {
  redirectToLogin()
  return
}

// Ensure "Bearer " prefix (with space)
headers: {
  'Authorization': `Bearer ${token}` // NOT `Bearer${token}`
}
```

---

## API Endpoints Reference

### Pay Periods

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/api/engine/pay-periods` | Create pay period | SUPER_ADMIN, ADMIN, HR |
| GET | `/api/engine/pay-periods` | List all pay periods | SUPER_ADMIN, ADMIN, HR, MANAGER |
| GET | `/api/engine/pay-periods/current` | Get current period | SUPER_ADMIN, ADMIN, HR, MANAGER |
| GET | `/api/engine/pay-periods/[id]` | Get single period | SUPER_ADMIN, ADMIN, HR, MANAGER |
| PATCH | `/api/engine/pay-periods/[id]` | Update period | SUPER_ADMIN, ADMIN |
| POST | `/api/engine/pay-periods/[id]/open-validation` | Open for validation | SUPER_ADMIN, ADMIN |
| POST | `/api/engine/pay-periods/[id]/close-validation` | Close validation | SUPER_ADMIN, ADMIN |
| POST | `/api/engine/pay-periods/[id]/compute` | Compute payroll | SUPER_ADMIN, ADMIN |
| POST | `/api/engine/pay-periods/[id]/approve` | Approve payroll | SUPER_ADMIN, ADMIN |
| GET | `/api/engine/pay-periods/[id]/summary` | Get period summary | SUPER_ADMIN, ADMIN |

### Employee Salaries

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/api/engine/employee-salaries` | Create salary record | SUPER_ADMIN, ADMIN |
| GET | `/api/engine/employee-salaries` | List all salaries | SUPER_ADMIN, ADMIN |
| GET | `/api/engine/employee-salaries/[staffId]` | Get staff salary | SUPER_ADMIN, ADMIN, HR, MANAGER |
| PUT | `/api/engine/employee-salaries/[staffId]` | Update salary | SUPER_ADMIN, ADMIN |
| DELETE | `/api/engine/employee-salaries/[staffId]` | Delete salary | SUPER_ADMIN, ADMIN |
| POST | `/api/engine/employee-salaries/import` | Bulk import | SUPER_ADMIN, ADMIN |

### Staff Management

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/api/engine/staff` | List staff with salary status | SUPER_ADMIN, ADMIN, HR |
| POST | `/api/engine/staff` | Create new staff record | SUPER_ADMIN, ADMIN, HR |
| GET | `/api/engine/staff/[id]` | Get single staff by ID | SUPER_ADMIN, ADMIN, HR |
| PUT | `/api/engine/staff/[id]` | Update staff record | SUPER_ADMIN, ADMIN |
| DELETE | `/api/engine/staff/[id]` | Deactivate staff (soft delete) | SUPER_ADMIN, ADMIN |

**Query Parameters for GET `/api/engine/staff`:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `search` - Search by name, staffId, or email
- `department` - Filter by department
- `includeInactive` - Include deactivated staff (default: false)

**Create Staff Request Body:**
```json
{
  "staffId": "EMP001",
  "email": "john.doe@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "department": "Engineering",
  "position": "Developer",
  "phone": "08012345678",
  "bankName": "First Bank",
  "accountNumber": "1234567890",
  "bvn": "12345678901"
}
```

**Staff Response (includes `hasSalaryStructure` for salary setup workflow):**
```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "staffId": "EMP001",
    "email": "john.doe@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "fullName": "John Doe",
    "department": "Engineering",
    "position": "Developer",
    "isActive": true,
    "hasSalaryStructure": false
  }
}
```

### Validations

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/api/engine/validations/[periodId]?type=summary` | Get validation summary | SUPER_ADMIN, ADMIN, MANAGER |
| GET | `/api/engine/validations/[periodId]?type=pending` | Get pending validations | SUPER_ADMIN, ADMIN, MANAGER |
| GET | `/api/engine/validations/[periodId]?type=withheld` | Get withheld staff | SUPER_ADMIN, ADMIN, MANAGER |
| GET | `/api/engine/validations/[periodId]?type=my-team` | Get my team validations | MANAGER |
| POST | `/api/engine/validations` | Submit validation | SUPER_ADMIN, ADMIN, MANAGER |
| POST | `/api/engine/validations?action=bulk` | Bulk validation | SUPER_ADMIN, ADMIN, MANAGER |

### Overtime

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/api/engine/overtime` | Create overtime entry | SUPER_ADMIN, ADMIN, MANAGER |
| GET | `/api/engine/overtime/[periodId]` | List overtime for period | SUPER_ADMIN, ADMIN, MANAGER |
| GET | `/api/engine/overtime/[periodId]/staff/[staffId]` | Get staff overtime | SUPER_ADMIN, ADMIN, MANAGER |
| POST | `/api/engine/overtime/upload/[periodId]` | Bulk upload overtime | SUPER_ADMIN, ADMIN |
| DELETE | `/api/engine/overtime/entry/[id]` | Delete entry | SUPER_ADMIN, ADMIN |

### Deductions

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/api/engine/deductions` | Create deduction | SUPER_ADMIN, ADMIN |
| GET | `/api/engine/deductions/[periodId]` | List deductions | SUPER_ADMIN, ADMIN |
| GET | `/api/engine/deductions/[periodId]/staff/[staffId]` | Get staff deductions | SUPER_ADMIN, ADMIN |
| POST | `/api/engine/deductions/upload/[periodId]?type=LOAN` | Bulk upload | SUPER_ADMIN, ADMIN |
| DELETE | `/api/engine/deductions/entry/[id]` | Delete entry | SUPER_ADMIN, ADMIN |

**Deduction Types:** `UNION_DUES`, `COOPERATIVE`, `LOAN`, `SALARY_ADVANCE`, `OTHER`

### Payslips

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/api/engine/payslips` | List payslips | All authenticated |
| GET | `/api/engine/payslips/my-payslips` | Get my payslips | All authenticated |
| GET | `/api/engine/payslips/period/[periodId]` | List period payslips | SUPER_ADMIN, ADMIN |
| GET | `/api/engine/payslips/[periodId]/[staffId]` | Get specific payslip | All authenticated |

### Reports

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/api/engine/reports/[periodId]?type=BANK_SCHEDULE` | Bank schedule | SUPER_ADMIN, ADMIN |
| GET | `/api/engine/reports/[periodId]?type=PAYE_SCHEDULE` | PAYE tax report | SUPER_ADMIN, ADMIN |
| GET | `/api/engine/reports/[periodId]?type=PENSION_SCHEDULE` | Pension report | SUPER_ADMIN, ADMIN |
| GET | `/api/engine/reports/[periodId]?type=NHF_SCHEDULE` | NHF report | SUPER_ADMIN, ADMIN |
| GET | `/api/engine/reports/[periodId]?type=WITHHELD_SALARIES` | Withheld salaries | SUPER_ADMIN, ADMIN |

Add `&download=true` to get Excel file instead of JSON.

---

## Standard Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... },
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 10
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "details": { ... }
}
```

---

## Frontend Best Practices

### 1. Create an API Client

```javascript
// api/payrollEngine.js
const BASE_URL = '/api/engine'

async function apiRequest(endpoint, options = {}) {
  const token = getAuthToken()

  if (!token) {
    throw new Error('No authentication token')
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      ...options.headers
    },
    credentials: 'include'
  })

  // Handle non-JSON responses
  const contentType = response.headers.get('content-type')
  if (!contentType?.includes('application/json')) {
    throw new Error(`Expected JSON but got ${contentType}. Check endpoint path.`)
  }

  const data = await response.json()

  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Request failed')
  }

  return data
}

// Usage
export const payPeriods = {
  list: (params) => apiRequest(`/pay-periods?${new URLSearchParams(params)}`),
  get: (id) => apiRequest(`/pay-periods/${id}`),
  create: (data) => apiRequest('/pay-periods', { method: 'POST', body: JSON.stringify(data) }),
  getCurrent: () => apiRequest('/pay-periods/current'),
}

export const validations = {
  getSummary: (periodId) => apiRequest(`/validations/${periodId}?type=summary`),
  getPending: (periodId) => apiRequest(`/validations/${periodId}?type=pending`),
  submit: (data) => apiRequest('/validations', { method: 'POST', body: JSON.stringify(data) }),
}

export const staff = {
  list: (params) => apiRequest(`/staff?${new URLSearchParams(params)}`),
  get: (id) => apiRequest(`/staff/${id}`),
  create: (data) => apiRequest('/staff', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`/staff/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deactivate: (id) => apiRequest(`/staff/${id}`, { method: 'DELETE' }),
}
```

### 2. Handle All Response States

```javascript
async function fetchPayPeriods() {
  try {
    setLoading(true)
    setError(null)

    const result = await payPeriods.list({ page: 1, limit: 10 })
    setData(result.data)
    setPagination(result.pagination)

  } catch (error) {
    if (error.message.includes('401') || error.message.includes('token')) {
      // Token expired - redirect to login
      redirectToLogin()
    } else if (error.message.includes('Expected JSON')) {
      // Wrong endpoint - likely 404
      setError('API endpoint not found. Please contact support.')
    } else {
      setError(error.message)
    }
  } finally {
    setLoading(false)
  }
}
```

### 3. Validate Before Submitting

```javascript
// Validate required fields before API call
function validatePayPeriod(data) {
  const errors = {}

  if (!data.year || data.year < 2020 || data.year > 2100) {
    errors.year = 'Year must be between 2020 and 2100'
  }

  if (!data.month || data.month < 1 || data.month > 12) {
    errors.month = 'Month must be between 1 and 12'
  }

  return Object.keys(errors).length ? errors : null
}

async function createPayPeriod(formData) {
  const errors = validatePayPeriod(formData)
  if (errors) {
    setValidationErrors(errors)
    return
  }

  await payPeriods.create(formData)
}
```

### 4. Download Reports Correctly

```javascript
async function downloadReport(periodId, reportType) {
  const token = getAuthToken()

  const response = await fetch(
    `/api/engine/reports/${periodId}?type=${reportType}&download=true`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message)
  }

  // Handle binary Excel file
  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${reportType}_${periodId}.xlsx`
  a.click()
  window.URL.revokeObjectURL(url)
}
```

---

## Staff & Salary Setup Workflow

The recommended workflow for setting up staff salaries:

1. **Add Staff** - Create staff records via `POST /api/engine/staff`
2. **List Staff** - Get staff list via `GET /api/engine/staff`
3. **Check Salary Status** - Use `hasSalaryStructure` field to identify staff needing salary setup
4. **Create Salary** - For staff with `hasSalaryStructure: false`, create salary via `POST /api/engine/employee-salaries`

```javascript
// Example: Get staff without salary structures
async function getStaffNeedingSalary() {
  const result = await staff.list({ limit: 500 })
  return result.data.filter(s => !s.hasSalaryStructure)
}

// Example: Setup salary for a staff member
async function setupSalary(staffData) {
  await employeeSalaries.create({
    staffId: staffData.id,
    basicSalary: 150000,
    housingAllowance: 50000,
    transportAllowance: 30000,
    // ... other fields
  })
}
```

---

## Checklist for Frontend Developers

- [ ] Use correct base path: `/api/engine/` (not `/api/payroll-engine/`)
- [ ] Include `Bearer ` prefix (with space) in Authorization header
- [ ] Add `Cache-Control: no-cache` to prevent 304 responses
- [ ] Handle non-JSON responses gracefully
- [ ] Check `success` field in response before using data
- [ ] Implement proper error handling for 401/403/404/500
- [ ] Use `credentials: 'include'` for cross-origin requests
- [ ] Validate form data before submitting to API
- [ ] Handle pagination in list endpoints
- [ ] Use query parameters correctly (e.g., `?type=summary`)
- [ ] Use `hasSalaryStructure` field to filter staff needing salary setup
- [ ] Validate staff fields before submission (staffId, email format, BVN 11 digits, account number 8-20 digits)
