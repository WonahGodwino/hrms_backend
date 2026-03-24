# Payroll Engine API Documentation

## Frontend Integration Guide

**Version:** 1.0.0
**Base URL:** `/api/engine`
**Last Updated:** March 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Response Format](#response-format)
4. [Error Handling](#error-handling)
5. [API Endpoints](#api-endpoints)
   - [Pay Periods](#pay-periods)
   - [Employee Salaries](#employee-salaries)
   - [Validation Portal](#validation-portal)
   - [Overtime](#overtime)
   - [Deductions](#deductions)
   - [Payslips](#payslips)
   - [Reports](#reports)
6. [TypeScript Interfaces](#typescript-interfaces)
7. [Frontend Implementation Examples](#frontend-implementation-examples)

---

## Overview

The Payroll Engine is an intelligent payroll computing module that handles:

- **Nigeria 2026 Tax Compliance** - PAYE calculation with rent relief and CRA
- **Validation Portal** - Supervisor "Yes/No for Payment" workflow
- **Overtime & Deductions Management** - With bulk upload support
- **Automated Report Generation** - Bank Schedule, PAYE, Pension, NHF, etc.

### Payroll Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                     PAYROLL LIFECYCLE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. DRAFT           → Admin creates pay period                  │
│  2. VALIDATION_OPEN → Supervisors validate team (14th-16th)     │
│  3. VALIDATION_CLOSED → Validation window closes                │
│  4. COMPUTING       → System computes payroll                   │
│  5. REVIEW          → Admin reviews computed payslips           │
│  6. APPROVED        → Payroll approved for payment              │
│  7. PAID            → Payment completed (final state)           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Authentication

All endpoints require JWT Bearer token authentication.

```typescript
const headers = {
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json'
};
```

### Role-Based Access

| Role | Description |
|------|-------------|
| `SUPER_ADMIN` | Platform admin - full access |
| `ADMIN` | Company admin - full payroll access |
| `MANAGER` | Supervisor - validation portal + limited read |
| `HR` | HR staff - read access to payslips |
| `STAFF` | Employee - view own payslips only |

---

## Response Format

### Success Response

```typescript
{
  success: true,
  message?: string,
  data: T,
  pagination?: {
    total: number,
    page: number,
    limit: number
  }
}
```

### Error Response

```typescript
{
  success: false,
  message: string,
  details?: object  // Validation errors
}
```

---

## Error Handling

| Status Code | Description |
|-------------|-------------|
| `400` | Bad Request - Invalid input data |
| `401` | Unauthorized - Missing or invalid token |
| `403` | Forbidden - Insufficient permissions |
| `404` | Not Found - Resource not found |
| `500` | Internal Server Error |

---

## API Endpoints

### Pay Periods

#### Create Pay Period

```http
POST /api/engine/pay-periods
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

**Request Body:**
```json
{
  "year": 2026,
  "month": 3,
  "standardMonthlyHours": 176
}
```

**Response:**
```json
{
  "success": true,
  "message": "Pay period created successfully",
  "data": {
    "id": "clx123...",
    "year": 2026,
    "month": 3,
    "periodName": "March 2026",
    "startDate": "2026-03-01T00:00:00.000Z",
    "endDate": "2026-03-31T23:59:59.999Z",
    "validationWindowStart": "2026-03-14T00:00:00.000Z",
    "validationWindowEnd": "2026-03-16T23:59:59.999Z",
    "status": "DRAFT",
    "standardMonthlyHours": 176,
    "companyId": "clx456...",
    "createdBy": "clx789...",
    "createdAt": "2026-03-01T10:00:00.000Z"
  }
}
```

---

#### Get All Pay Periods

```http
GET /api/engine/pay-periods?page=1&limit=10&year=2026&status=DRAFT
```

**Roles:** `SUPER_ADMIN`, `ADMIN`, `MANAGER`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Items per page (default: 10) |
| `year` | number | No | Filter by year |
| `status` | string | No | Filter by status |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx123...",
      "year": 2026,
      "month": 3,
      "periodName": "March 2026",
      "status": "DRAFT",
      "createdAt": "2026-03-01T10:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 12,
    "page": 1,
    "limit": 10
  }
}
```

---

#### Get Current Active Period

```http
GET /api/engine/pay-periods/current
```

**Roles:** `SUPER_ADMIN`, `ADMIN`, `MANAGER`

---

#### Get Pay Period by ID

```http
GET /api/engine/pay-periods/:id
```

**Roles:** `SUPER_ADMIN`, `ADMIN`, `MANAGER`

---

#### Update Pay Period

```http
PATCH /api/engine/pay-periods/:id
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

**Note:** Can only update periods in `DRAFT` status.

**Request Body:**
```json
{
  "standardMonthlyHours": 180
}
```

---

#### Open Validation Window

```http
POST /api/engine/pay-periods/:id/open-validation
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

**Description:** Opens the validation window and initializes validation records for all active staff.

**Response:**
```json
{
  "success": true,
  "message": "Validation window opened. 45 staff members ready for validation.",
  "data": {
    "periodId": "clx123...",
    "status": "VALIDATION_OPEN",
    "staffInitialized": 45
  }
}
```

---

#### Close Validation Window

```http
POST /api/engine/pay-periods/:id/close-validation
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

---

#### Compute Payroll

```http
POST /api/engine/pay-periods/:id/compute
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

**Request Body:**
```json
{
  "nhisApplicable": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payroll computed successfully",
  "data": {
    "processed": 45,
    "errors": [],
    "summary": {
      "totalGross": 15750000,
      "totalNet": 12600000,
      "totalPAYE": 1890000,
      "totalPension": 1260000
    }
  }
}
```

---

#### Approve Payroll

```http
POST /api/engine/pay-periods/:id/approve
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

---

#### Get Payroll Summary

```http
GET /api/engine/pay-periods/:id/summary
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalStaff": 45,
    "totalGross": 15750000,
    "totalNet": 12600000,
    "totalPAYE": 1890000,
    "totalPension": 1260000,
    "totalNHF": 393750,
    "activeCount": 42,
    "withheldCount": 3
  }
}
```

---

### Employee Salaries

#### Create Salary Structure

```http
POST /api/engine/employee-salaries
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

**Request Body:**
```json
{
  "staffId": "clx123...",
  "employeeCategory": "REGULAR",
  "basicSalary": 350000,
  "housingAllowance": 105000,
  "transportAllowance": 52500,
  "dressingAllowance": 17500,
  "leaveAllowance": 17500,
  "entertainmentAllowance": 17500,
  "utilityAllowance": 17500,
  "otherAllowances": 0,
  "annualRent": 1200000,
  "bankName": "First Bank",
  "accountNumber": "1234567890",
  "accountName": "John Doe",
  "pensionFundAdministrator": "ARM Pension",
  "pensionPin": "PEN123456789",
  "effectiveDate": "2026-01-01"
}
```

---

#### Get All Salary Structures

```http
GET /api/engine/employee-salaries?page=1&limit=10&isActive=true&employeeCategory=REGULAR
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

---

#### Get Salary by Staff ID

```http
GET /api/engine/employee-salaries/:staffId
```

**Roles:** `SUPER_ADMIN`, `ADMIN`, `MANAGER`

---

#### Update Salary Structure

```http
PUT /api/engine/employee-salaries/:staffId
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

---

#### Deactivate Salary Structure

```http
DELETE /api/engine/employee-salaries/:staffId
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

---

#### Bulk Import Salary Structures

```http
POST /api/engine/employee-salaries/import
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

**Request Body:**
```json
{
  "data": [
    {
      "staffId": "clx123...",
      "basicSalary": 350000,
      "housingAllowance": 105000,
      "transportAllowance": 52500,
      "bankName": "First Bank",
      "accountNumber": "1234567890",
      "accountName": "John Doe"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Import completed: 10 created, 5 updated",
  "data": {
    "created": 10,
    "updated": 5,
    "errors": []
  }
}
```

---

### Validation Portal

#### Validate Single Staff

```http
POST /api/engine/validations
```

**Roles:** `SUPER_ADMIN`, `ADMIN`, `MANAGER`

**Request Body (Approve):**
```json
{
  "payPeriodId": "clx123...",
  "staffId": "clx456...",
  "status": "YES_FOR_PAYMENT"
}
```

**Request Body (Withhold):**
```json
{
  "payPeriodId": "clx123...",
  "staffId": "clx456...",
  "status": "NO_FOR_PAYMENT",
  "reason": "Employee on unpaid leave"
}
```

---

#### Bulk Validate Staff

```http
POST /api/engine/validations?action=bulk
```

**Roles:** `SUPER_ADMIN`, `ADMIN`, `MANAGER`

**Request Body:**
```json
{
  "payPeriodId": "clx123...",
  "validations": [
    { "staffId": "clx456...", "status": "YES_FOR_PAYMENT" },
    { "staffId": "clx789...", "status": "YES_FOR_PAYMENT" },
    { "staffId": "clx012...", "status": "NO_FOR_PAYMENT", "reason": "Absent" }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "3 staff members validated successfully",
  "data": {
    "updated": 3,
    "errors": []
  }
}
```

---

#### Get Validation Summary

```http
GET /api/engine/validations/:periodId?type=summary
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 45,
    "pending": 5,
    "yesForPayment": 38,
    "noForPayment": 2,
    "percentageCompleted": 88.89
  }
}
```

---

#### Get Pending Validations

```http
GET /api/engine/validations/:periodId?type=pending
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

---

#### Get Withheld Staff

```http
GET /api/engine/validations/:periodId?type=withheld
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

---

#### Get My Team for Validation

```http
GET /api/engine/validations/:periodId?type=my-team
```

**Roles:** `SUPER_ADMIN`, `ADMIN`, `MANAGER`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx123...",
      "staffId": "clx456...",
      "status": "PENDING",
      "staff": {
        "id": "clx456...",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@company.com",
        "department": "Engineering"
      }
    }
  ]
}
```

---

### Overtime

#### Create Overtime Entry

```http
POST /api/engine/overtime
```

**Roles:** `SUPER_ADMIN`, `ADMIN`, `MANAGER`

**Request Body:**
```json
{
  "payPeriodId": "clx123...",
  "staffId": "clx456...",
  "overtimeHours": 8,
  "multiplier": 1.5,
  "date": "2026-03-15",
  "description": "Weekend support shift"
}
```

---

#### Get Overtime by Period

```http
GET /api/engine/overtime/:periodId?page=1&limit=10&staffId=clx456...
```

**Roles:** `SUPER_ADMIN`, `ADMIN`, `MANAGER`

---

#### Get Staff Overtime Total

```http
GET /api/engine/overtime/:periodId/staff/:staffId
```

**Roles:** `SUPER_ADMIN`, `ADMIN`, `MANAGER`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalHours": 16,
    "entries": [
      {
        "id": "clx123...",
        "overtimeHours": 8,
        "multiplier": 1.5,
        "date": "2026-03-15T00:00:00.000Z",
        "description": "Weekend shift"
      }
    ]
  }
}
```

---

#### Delete Overtime Entry

```http
DELETE /api/engine/overtime/entry/:id
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

---

#### Bulk Upload Overtime

```http
POST /api/engine/overtime/upload/:periodId
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

**Request Body:**
```json
{
  "data": [
    {
      "staffId": "clx456...",
      "overtimeHours": 8,
      "multiplier": 1.5,
      "description": "Weekend shift"
    }
  ]
}
```

---

### Deductions

#### Create Deduction Entry

```http
POST /api/engine/deductions
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

**Request Body:**
```json
{
  "payPeriodId": "clx123...",
  "staffId": "clx456...",
  "deductionType": "COOPERATIVE",
  "amount": 25000,
  "description": "Monthly cooperative contribution"
}
```

**Deduction Types:**
- `UNION_DUES` - Union membership dues
- `COOPERATIVE` - Cooperative society contributions
- `LOAN` - Loan repayments
- `SALARY_ADVANCE` - Salary advance recovery
- `OTHER` - Other miscellaneous deductions

---

#### Get Deductions by Period

```http
GET /api/engine/deductions/:periodId?page=1&limit=10&deductionType=COOPERATIVE
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

---

#### Get Deduction Summary by Type

```http
GET /api/engine/deductions/:periodId?type=summary
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

**Response:**
```json
{
  "success": true,
  "data": [
    { "type": "UNION_DUES", "count": 30, "totalAmount": 150000 },
    { "type": "COOPERATIVE", "count": 30, "totalAmount": 750000 },
    { "type": "LOAN", "count": 10, "totalAmount": 500000 }
  ]
}
```

---

#### Get Staff Deductions

```http
GET /api/engine/deductions/:periodId/staff/:staffId
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

**Response:**
```json
{
  "success": true,
  "data": {
    "unionDues": 5000,
    "cooperativeDeduction": 25000,
    "loanRepayment": 50000,
    "otherDeductions": 0,
    "total": 80000
  }
}
```

---

#### Delete Deduction Entry

```http
DELETE /api/engine/deductions/entry/:id
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

---

#### Bulk Upload Deductions

```http
POST /api/engine/deductions/upload/:periodId?type=COOPERATIVE
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

**Request Body:**
```json
{
  "data": [
    {
      "staffId": "clx456...",
      "amount": 25000,
      "description": "Monthly contribution"
    }
  ]
}
```

---

### Payslips

#### Get My Payslips (Staff)

```http
GET /api/engine/payslips/my-payslips
```

**Roles:** All authenticated users

**Response:**
```json
{
  "success": true,
  "staffId": "clx456...",
  "data": [
    {
      "id": "clx123...",
      "payPeriodId": "clx789...",
      "grossSalary": 577500,
      "totalDeductions": 138600,
      "netSalary": 438900,
      "paymentStatus": "ACTIVE",
      "payPeriod": {
        "periodName": "March 2026",
        "year": 2026,
        "month": 3
      }
    }
  ]
}
```

---

#### Get Payslips by Period

```http
GET /api/engine/payslips/period/:periodId?page=1&limit=10&paymentStatus=ACTIVE
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

---

#### Get Specific Payslip

```http
GET /api/engine/payslips/:periodId/:staffId
```

**Roles:** `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `STAFF` (own payslip only)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "clx123...",
    "payPeriodId": "clx789...",
    "staffId": "clx456...",
    "employeeName": "John Doe",
    "employeeEmail": "john@company.com",
    "departmentName": "Engineering",

    "basicSalary": 350000,
    "housingAllowance": 105000,
    "transportAllowance": 52500,
    "dressingAllowance": 17500,
    "leaveAllowance": 17500,
    "entertainmentAllowance": 17500,
    "utilityAllowance": 17500,
    "otherAllowances": 0,
    "overtimeEarnings": 47727.27,
    "bonusKpi": 0,
    "grossSalary": 625227.27,

    "pensionEmployee": 40600,
    "pensionEmployer": 50750,
    "nhf": 8750,
    "nhis": 31261.36,
    "totalStatutoryDeductions": 80611.36,

    "annualGrossIncome": 7502727.27,
    "rentRelief": 240000,
    "consolidatedReliefAllowance": 1700545.45,
    "annualChargeableIncome": 4589970.46,
    "annualPAYE": 731293.89,
    "monthlyPAYE": 60941.16,

    "unionDues": 5000,
    "cooperativeDeduction": 25000,
    "loanRepayment": 0,
    "otherDeductions": 0,
    "totalDeductions": 171552.52,

    "netSalary": 453674.75,

    "paymentStatus": "ACTIVE",
    "validationStatus": "YES_FOR_PAYMENT",

    "bankName": "First Bank",
    "accountNumber": "1234567890",
    "accountName": "John Doe",
    "pensionFundAdministrator": "ARM Pension",
    "pensionPin": "PEN123456789"
  }
}
```

---

### Reports

#### Get Report Data

```http
GET /api/engine/reports/:periodId?type=REPORT_TYPE
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

**Report Types:**
- `BANK_SCHEDULE` - Bank payment schedule
- `WITHHELD_SALARIES` - Withheld staff list
- `PAYE_SCHEDULE` - PAYE tax schedule
- `PENSION_SCHEDULE` - Pension contributions
- `NHF_SCHEDULE` - National Housing Fund
- `ITF_SCHEDULE` - Industrial Training Fund
- `NSITF_SCHEDULE` - NSITF contributions
- `COST_CENTRE_SUMMARY` - Department breakdown

---

#### Download Report as Excel

```http
GET /api/engine/reports/:periodId?type=REPORT_TYPE&download=true
```

**Roles:** `SUPER_ADMIN`, `ADMIN`

**Response:** Excel file download (.xlsx)

---

## TypeScript Interfaces

```typescript
// Enums
enum PayPeriodStatus {
  DRAFT = 'DRAFT',
  VALIDATION_OPEN = 'VALIDATION_OPEN',
  VALIDATION_CLOSED = 'VALIDATION_CLOSED',
  COMPUTING = 'COMPUTING',
  REVIEW = 'REVIEW',
  APPROVED = 'APPROVED',
  PAID = 'PAID'
}

enum ValidationStatus {
  PENDING = 'PENDING',
  YES_FOR_PAYMENT = 'YES_FOR_PAYMENT',
  NO_FOR_PAYMENT = 'NO_FOR_PAYMENT'
}

enum PaymentStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  WITHHELD = 'WITHHELD',
  PAID = 'PAID'
}

enum EmployeeCategory {
  REGULAR = 'REGULAR',
  CONTRACT = 'CONTRACT'
}

enum DeductionType {
  UNION_DUES = 'UNION_DUES',
  COOPERATIVE = 'COOPERATIVE',
  LOAN = 'LOAN',
  SALARY_ADVANCE = 'SALARY_ADVANCE',
  OTHER = 'OTHER'
}

// Interfaces
interface PayPeriod {
  id: string;
  companyId: string;
  year: number;
  month: number;
  periodName: string;
  startDate: string;
  endDate: string;
  validationWindowStart: string | null;
  validationWindowEnd: string | null;
  status: PayPeriodStatus;
  standardMonthlyHours: number;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EmployeeSalary {
  id: string;
  staffId: string;
  companyId: string;
  employeeCategory: EmployeeCategory;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  dressingAllowance: number;
  leaveAllowance: number;
  entertainmentAllowance: number;
  utilityAllowance: number;
  otherAllowances: number;
  annualRent: number;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  pensionFundAdministrator: string | null;
  pensionPin: string | null;
  isActive: boolean;
  effectiveDate: string | null;
}

interface ComputedPayslip {
  id: string;
  payPeriodId: string;
  staffId: string;
  employeeName: string;
  employeeEmail: string;
  departmentName: string;

  // Earnings
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  dressingAllowance: number;
  leaveAllowance: number;
  entertainmentAllowance: number;
  utilityAllowance: number;
  otherAllowances: number;
  overtimeEarnings: number;
  bonusKpi: number;
  grossSalary: number;

  // Statutory Deductions
  pensionEmployee: number;
  pensionEmployer: number;
  nhf: number;
  nhis: number;
  totalStatutoryDeductions: number;

  // Tax
  annualGrossIncome: number;
  rentRelief: number;
  consolidatedReliefAllowance: number;
  annualChargeableIncome: number;
  annualPAYE: number;
  monthlyPAYE: number;

  // Other Deductions
  unionDues: number;
  cooperativeDeduction: number;
  loanRepayment: number;
  otherDeductions: number;
  totalDeductions: number;

  // Net
  netSalary: number;

  // Status
  paymentStatus: PaymentStatus;
  validationStatus: ValidationStatus | null;
  withheldReason: string | null;

  // Banking
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
}

interface ValidationSummary {
  total: number;
  pending: number;
  yesForPayment: number;
  noForPayment: number;
  percentageCompleted: number;
}

interface PayrollSummary {
  totalStaff: number;
  totalGross: number;
  totalNet: number;
  totalPAYE: number;
  totalPension: number;
  totalNHF: number;
  activeCount: number;
  withheldCount: number;
}
```

---

## Frontend Implementation Examples

### React/TypeScript Example

```typescript
// api/payrollEngine.ts
import axios from 'axios';

const API_BASE = '/api/engine';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Pay Periods
export const payPeriods = {
  getAll: (params?: { page?: number; limit?: number; year?: number; status?: string }) =>
    api.get('/pay-periods', { params }),

  getCurrent: () =>
    api.get('/pay-periods/current'),

  getById: (id: string) =>
    api.get(`/pay-periods/${id}`),

  create: (data: { year: number; month: number; standardMonthlyHours?: number }) =>
    api.post('/pay-periods', data),

  update: (id: string, data: { standardMonthlyHours?: number }) =>
    api.patch(`/pay-periods/${id}`, data),

  openValidation: (id: string) =>
    api.post(`/pay-periods/${id}/open-validation`),

  closeValidation: (id: string) =>
    api.post(`/pay-periods/${id}/close-validation`),

  compute: (id: string, data?: { nhisApplicable?: boolean }) =>
    api.post(`/pay-periods/${id}/compute`, data),

  approve: (id: string) =>
    api.post(`/pay-periods/${id}/approve`),

  getSummary: (id: string) =>
    api.get(`/pay-periods/${id}/summary`)
};

// Validations
export const validations = {
  validateSingle: (data: { payPeriodId: string; staffId: string; status: string; reason?: string }) =>
    api.post('/validations', data),

  validateBulk: (data: { payPeriodId: string; validations: Array<{ staffId: string; status: string; reason?: string }> }) =>
    api.post('/validations?action=bulk', data),

  getSummary: (periodId: string) =>
    api.get(`/validations/${periodId}?type=summary`),

  getMyTeam: (periodId: string) =>
    api.get(`/validations/${periodId}?type=my-team`),

  getPending: (periodId: string) =>
    api.get(`/validations/${periodId}?type=pending`),

  getWithheld: (periodId: string) =>
    api.get(`/validations/${periodId}?type=withheld`)
};

// Payslips
export const payslips = {
  getMyPayslips: () =>
    api.get('/payslips/my-payslips'),

  getByPeriod: (periodId: string, params?: { page?: number; limit?: number; paymentStatus?: string }) =>
    api.get(`/payslips/period/${periodId}`, { params }),

  getOne: (periodId: string, staffId: string) =>
    api.get(`/payslips/${periodId}/${staffId}`)
};

// Reports
export const reports = {
  get: (periodId: string, type: string) =>
    api.get(`/reports/${periodId}?type=${type}`),

  download: (periodId: string, type: string) =>
    api.get(`/reports/${periodId}?type=${type}&download=true`, {
      responseType: 'blob'
    })
};
```

### React Component Example - Validation Portal

```tsx
// components/ValidationPortal.tsx
import React, { useState, useEffect } from 'react';
import { validations } from '../api/payrollEngine';

interface TeamMember {
  id: string;
  staffId: string;
  status: 'PENDING' | 'YES_FOR_PAYMENT' | 'NO_FOR_PAYMENT';
  staff: {
    firstName: string;
    lastName: string;
    email: string;
    department: string;
  };
}

export const ValidationPortal: React.FC<{ periodId: string }> = ({ periodId }) => {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const [withholdReason, setWithholdReason] = useState('');

  useEffect(() => {
    loadTeam();
  }, [periodId]);

  const loadTeam = async () => {
    try {
      const response = await validations.getMyTeam(periodId);
      setTeam(response.data.data);
    } catch (error) {
      console.error('Failed to load team:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async (staffId: string, status: string, reason?: string) => {
    try {
      await validations.validateSingle({
        payPeriodId: periodId,
        staffId,
        status,
        reason
      });
      loadTeam(); // Refresh
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  const handleBulkValidate = async (status: string) => {
    const validationData = Array.from(selectedStaff).map(staffId => ({
      staffId,
      status,
      reason: status === 'NO_FOR_PAYMENT' ? withholdReason : undefined
    }));

    try {
      await validations.validateBulk({
        payPeriodId: periodId,
        validations: validationData
      });
      setSelectedStaff(new Set());
      loadTeam();
    } catch (error) {
      console.error('Bulk validation failed:', error);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="validation-portal">
      <h2>Team Validation - {periodId}</h2>

      <div className="bulk-actions">
        <button onClick={() => handleBulkValidate('YES_FOR_PAYMENT')}>
          Approve Selected ({selectedStaff.size})
        </button>
        <input
          type="text"
          placeholder="Reason for withholding..."
          value={withholdReason}
          onChange={(e) => setWithholdReason(e.target.value)}
        />
        <button onClick={() => handleBulkValidate('NO_FOR_PAYMENT')}>
          Withhold Selected
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Select</th>
            <th>Name</th>
            <th>Department</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {team.map((member) => (
            <tr key={member.id}>
              <td>
                <input
                  type="checkbox"
                  checked={selectedStaff.has(member.staffId)}
                  onChange={(e) => {
                    const newSelected = new Set(selectedStaff);
                    if (e.target.checked) {
                      newSelected.add(member.staffId);
                    } else {
                      newSelected.delete(member.staffId);
                    }
                    setSelectedStaff(newSelected);
                  }}
                />
              </td>
              <td>{member.staff.firstName} {member.staff.lastName}</td>
              <td>{member.staff.department}</td>
              <td>
                <span className={`status-badge ${member.status.toLowerCase()}`}>
                  {member.status}
                </span>
              </td>
              <td>
                {member.status === 'PENDING' && (
                  <>
                    <button onClick={() => handleValidate(member.staffId, 'YES_FOR_PAYMENT')}>
                      ✓ Yes
                    </button>
                    <button onClick={() => handleValidate(member.staffId, 'NO_FOR_PAYMENT', 'Pending review')}>
                      ✗ No
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

---

## Notes for Frontend Team

1. **Status Colors:**
   - `PENDING` - Yellow/Orange
   - `YES_FOR_PAYMENT` / `ACTIVE` - Green
   - `NO_FOR_PAYMENT` / `WITHHELD` - Red
   - `DRAFT` - Gray
   - `PAID` - Blue

2. **Currency Formatting:**
   - All monetary values are in Nigerian Naira (₦)
   - Use `Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' })`

3. **Date Handling:**
   - All dates are in ISO 8601 format
   - Validation window: 14th-16th of each month

4. **Pagination:**
   - Default page size: 10
   - Maximum page size: 100

5. **File Downloads:**
   - Reports are downloaded as `.xlsx` files
   - Use `responseType: 'blob'` for downloads

---

**Questions?** Contact the backend team for support.
