# Multi-State Tax Compliance & Filing API Documentation

## Frontend Integration Guide

**Version:** 1.0.0
**Base URL:** `/api/engine/tax-filing`
**Last Updated:** March 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Response Format](#response-format)
4. [Error Handling](#error-handling)
5. [API Endpoints](#api-endpoints)
   - [Tax Profiles](#tax-profiles)
   - [Monthly Filing](#monthly-filing)
   - [Annual Returns](#annual-returns)
   - [Tax Certificates](#tax-certificates)
   - [Dashboard](#dashboard)
   - [States Overview](#states-overview)
6. [TypeScript Interfaces](#typescript-interfaces)
7. [Nigeria States Reference](#nigeria-states-reference)
8. [Frontend Implementation Examples](#frontend-implementation-examples)

---

## Overview

The Multi-State Tax Compliance & Filing module handles Nigerian state-by-state PAYE tax filing, monthly schedule generation, and annual Form H1 returns. It integrates with the Payroll Engine to provide:

- **Multi-State Tax Routing** - Routes employees to correct state IRS based on residence
- **Monthly PAYE Schedules** - Auto-generates state-specific filing schedules
- **Annual Form H1 Returns** - Employer's Annual Return of Income Tax deductions
- **Employee Tax Certificates** - Individual tax certificates for employees
- **JTB TIN Validation** - Validates 13-digit Joint Tax Board Tax IDs
- **January 1st State Locking** - Per PITA, locks employee's tax state on Jan 1st

### Tax Filing Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    TAX FILING LIFECYCLE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. SETUP TAX PROFILES  → Assign state of residence + TIN       │
│  2. LOCK STATES (JAN 1) → Lock employee states for the year     │
│  3. RUN PAYROLL         → Payroll Engine computes PAYE          │
│  4. GENERATE SCHEDULES  → Create monthly PAYE schedules         │
│  5. FILE WITH IRS       → Download & submit to state IRS        │
│  6. MARK AS FILED       → Record filing status                  │
│  7. ANNUAL RETURN       → Generate Form H1 at year end          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Integration with Payroll Engine

This module reads from:
- `ComputedPayslip` - Monthly PAYE, gross income, pension
- `StaffRecord` - Employee names, staff IDs
- `PayPeriod` - Period year/month
- `Company` - Company tax ID, name

The module does **NOT** modify any existing payroll data.

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
| `SUPER_ADMIN` | Platform admin - full access to all companies |
| `ADMIN` | Company admin - full access with companyId |
| `HR` | HR staff - full access to own company |
| `STAFF` | Employee - can view own tax profile only |

### Company ID Requirements

| Role | companyId Parameter |
|------|---------------------|
| `SUPER_ADMIN` | Required in query/body |
| `ADMIN` | Required in query/body |
| `HR` | Auto-populated from token |
| `STAFF` | Auto-populated from token |

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
  error?: {
    code: string,
    details?: any
  }
}
```

### Common HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Invalid/missing token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found |
| 409 | Conflict - Duplicate entry |
| 500 | Internal Server Error |

---

## Error Handling

### Common Errors

```typescript
// Invalid State
{ message: "Invalid state name: XYZ" }

// Missing Tax Profile
{ message: "Tax profile not found" }

// Invalid TIN Format
{ message: "Invalid JTB TIN format. Must be 13 digits" }

// Profile Already Exists
{ message: "Tax profile already exists for this employee" }

// No Employees Found
{ message: "No employees found for state LA in this period" }
```

---

## API Endpoints

### Tax Profiles

#### List Tax Profiles

```http
GET /api/engine/tax-filing/profiles
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| companyId | string | Admin only | Company ID |
| page | number | No | Page number (default: 1) |
| limit | number | No | Items per page (default: 50) |
| state | string | No | Filter by state code |
| search | string | No | Search by name or staff ID |
| missingProfiles | boolean | No | Get employees without profiles |

**Response:**

```typescript
{
  success: true,
  data: {
    profiles: [
      {
        id: "clx...",
        staffId: "clx...",
        companyId: "clx...",
        stateOfResidence: "Lagos",
        jtbTin: "1234-567-8901-3",
        tinVerified: false,
        lockedState: "Lagos",
        lockedDate: "2026-01-01T00:00:00.000Z",
        pfaName: "ARM Pension",
        staff: {
          staffId: "EMP001",
          firstName: "John",
          lastName: "Doe",
          email: "john@company.com"
        }
      }
    ],
    total: 100,
    page: 1,
    limit: 50
  }
}
```

#### Get Employees Without Tax Profiles

```http
GET /api/engine/tax-filing/profiles?missingProfiles=true
```

**Response:**

```typescript
{
  success: true,
  data: {
    employees: [
      {
        id: "clx...",
        staffId: "EMP002",
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@company.com",
        department: "Engineering"
      }
    ],
    total: 15
  }
}
```

#### Get Single Tax Profile

```http
GET /api/engine/tax-filing/profiles/{staffId}
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| staffId | string | Staff record ID (UUID) or Employee ID |

#### Staff Lookup (for Dropdown Selection)

```http
GET /api/engine/tax-filing/profiles/staff-lookup
```

Use this endpoint to populate staff dropdown when creating tax profiles. It integrates with the existing staff module (`/api/engine/staff`).

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| companyId | string | Admin only | Company ID |
| search | string | No | Search by name, staffId, or email |
| withoutProfile | boolean | No | If `true`, only return staff without tax profiles |
| limit | number | No | Max results (default: 500) |

**Example Request:**

```http
GET /api/engine/tax-filing/profiles/staff-lookup?withoutProfile=true&limit=500
```

**Response:**

```typescript
{
  success: true,
  message: "Staff list retrieved successfully",
  data: {
    staff: [
      {
        id: "clx123abc...",           // UUID - use this for API calls
        staffId: "EMP001",            // Employee ID - display to user
        fullName: "John Doe",
        firstName: "John",
        lastName: "Doe",
        email: "john@company.com",
        department: "Engineering",
        position: "Developer",
        hasTaxProfile: false,
        taxProfile: null,
        label: "EMP001 - John Doe",   // For dropdown display
        value: "clx123abc..."         // For dropdown value
      }
    ],
    summary: {
      total: 50,
      withTaxProfile: 35,
      withoutTaxProfile: 15
    }
  }
}
```

**Frontend Integration:**

```typescript
// Fetch staff for dropdown
const { data } = await axios.get('/api/engine/tax-filing/profiles/staff-lookup', {
  params: { withoutProfile: true }
});

// Use in dropdown
<Select
  options={data.staff.map(s => ({ label: s.label, value: s.value }))}
  onChange={(selected) => setSelectedStaffId(selected.value)}
/>
```

#### Create Tax Profile

```http
POST /api/engine/tax-filing/profiles
```

**Request Body:**

```typescript
{
  staffId: string,          // Required - Staff record UUID OR Employee ID (e.g., "EMP001")
  stateOfResidence: string, // Required - Nigeria state name
  jtbTin?: string,          // Optional - 13-digit TIN
  pfaName?: string,         // Optional - Pension Fund Administrator
  companyId?: string        // Required for Admin/Super_Admin
}
```

> **Note:** The `staffId` field accepts either:
> - UUID from staff-lookup endpoint (e.g., `"clx123abc..."`)
> - Employee ID (e.g., `"EMP001"`)
>
> The API automatically resolves either format to the correct staff record.

**Example with UUID:**

```json
{
  "staffId": "clx123abc...",
  "stateOfResidence": "Lagos",
  "jtbTin": "1234567890123",
  "pfaName": "ARM Pension"
}
```

**Example with Employee ID:**

```json
{
  "staffId": "EMP001",
  "stateOfResidence": "Lagos",
  "jtbTin": "1234567890123",
  "pfaName": "ARM Pension"
}
```

**Response:**

```typescript
{
  success: true,
  message: "Tax profile created successfully",
  data: {
    id: "clx...",
    staffId: "clx...",
    stateOfResidence: "Lagos",
    jtbTin: "1234-567-8901-3",
    tinVerified: false,
    pfaName: "ARM Pension"
  }
}
```

#### Update Tax Profile

```http
PUT /api/engine/tax-filing/profiles/{staffId}
```

**Request Body:**

```typescript
{
  stateOfResidence?: string,
  jtbTin?: string,
  pfaName?: string,
  tinVerified?: boolean,    // Admin only
  companyId?: string        // Required for Admin/Super_Admin
}
```

#### Delete Tax Profile

```http
DELETE /api/engine/tax-filing/profiles/{staffId}?companyId={companyId}
```

#### Bulk Import Tax Profiles

```http
POST /api/engine/tax-filing/profiles/upload
Content-Type: multipart/form-data
```

**Form Data:**

| Field | Type | Description |
|-------|------|-------------|
| file | File | Excel/CSV file |
| companyId | string | Company ID (Admin only) |

**Expected File Columns:**

| Column | Required | Description |
|--------|----------|-------------|
| staffId | Yes | Employee staff ID (e.g., "EMP001") |
| stateOfResidence | Yes | State name (e.g., "Lagos") |
| jtbTin | No | 13-digit TIN |
| pfaName | No | Pension fund name |

**Response:**

```typescript
{
  success: true,
  message: "Import completed. Successful: 95, Failed: 5",
  data: {
    total: 100,
    successful: 95,
    failed: 5,
    errors: [
      { row: 3, staffId: "EMP003", error: "Invalid state name" },
      { row: 7, staffId: "EMP007", error: "Employee not found" }
    ],
    failedFileUrl: "/api/engine/tax-filing/profiles/download-failed/clx..."
  }
}
```

#### Download Import Template

```http
GET /api/engine/tax-filing/profiles/template?companyId={companyId}
```

Returns an Excel template with column headers and sample data.

#### Lock States for Year (January 1st Rule)

```http
POST /api/engine/tax-filing/profiles/lock-states
```

Per PITA, an employee's tax state is locked on January 1st of each year.

**Request Body:**

```typescript
{
  year: number,       // Year to lock (e.g., 2026)
  companyId?: string  // Required for Admin/Super_Admin
}
```

**Response:**

```typescript
{
  success: true,
  message: "States locked for 2026",
  data: {
    locked: 150,
    skipped: 10,
    year: 2026
  }
}
```

#### Check Lock Status

```http
GET /api/engine/tax-filing/profiles/lock-states?companyId={companyId}
```

**Response:**

```typescript
{
  success: true,
  data: {
    locked: true,
    lockedDate: "2026-01-01T00:00:00.000Z",
    year: 2026
  }
}
```

---

### Monthly Filing

#### Get Monthly Filing Summary

```http
GET /api/engine/tax-filing/monthly/{periodId}?companyId={companyId}
```

**Response:**

```typescript
{
  success: true,
  data: {
    period: {
      id: "clx...",
      year: 2026,
      month: 3,
      periodName: "March 2026",
      status: "PAID"
    },
    schedules: [
      {
        id: "clx...",
        stateCode: "LA",
        stateName: "Lagos",
        stateIrs: "LIRS",
        totalEmployees: 50,
        totalTaxAmount: 2500000.00,
        totalGrossIncome: 25000000.00,
        status: "GENERATED",
        filedAt: null,
        filedBy: null
      }
    ],
    stateSummary: [
      {
        stateCode: "LA",
        stateName: "Lagos",
        employeeCount: 50,
        totalTax: 2500000.00,
        totalGross: 25000000.00
      }
    ],
    missingEmployees: [
      {
        id: "clx...",
        staffId: "EMP015",
        name: "Missing Profile Employee"
      }
    ],
    summary: {
      totalStates: 5,
      totalEmployees: 150,
      totalTaxAmount: 7500000.00,
      missingEmployeesCount: 3,
      schedulesGenerated: true
    }
  }
}
```

#### Generate Monthly Schedules

```http
POST /api/engine/tax-filing/monthly/{periodId}
```

**Request Body:**

```typescript
{
  companyId?: string  // Required for Admin/Super_Admin
}
```

**Response:**

```typescript
{
  success: true,
  message: "Generated 5 state schedules",
  data: {
    schedules: [...],
    summary: {
      totalStates: 5,
      totalEmployees: 150,
      totalTaxAmount: 7500000.00,
      missingEmployeesCount: 3
    },
    warning: "3 employees are missing tax profiles and were not included"
  }
}
```

#### Get State Schedule Details

```http
GET /api/engine/tax-filing/monthly/{periodId}/{stateCode}?companyId={companyId}
```

**Response:**

```typescript
{
  success: true,
  data: {
    scheduleData: {
      stateCode: "LA",
      stateName: "Lagos",
      irsName: "LIRS",
      period: { year: 2026, month: 3 },
      employees: [
        {
          sn: 1,
          taxpayerName: "DOE, John Adebayo",
          jtbTin: "1234-567-8901-3",
          staffId: "EMP001",
          grossIncome: 500000.00,
          consolidatedRelief: 30000.00,
          rentRelief: 10000.00,
          pensionContribution: 40000.00,
          taxPayable: 85000.00,
          monthYear: "Mar 2026"
        }
      ],
      totals: {
        grossIncome: 25000000.00,
        taxAmount: 2500000.00,
        employeeCount: 50
      }
    },
    filingStatus: {
      status: "GENERATED",
      filedAt: null,
      filedBy: null,
      paymentReference: null
    }
  }
}
```

#### Download State Schedule

```http
GET /api/engine/tax-filing/monthly/{periodId}/{stateCode}/download?format={format}&companyId={companyId}
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| format | string | xlsx | Export format: `xlsx` or `csv` |
| companyId | string | - | Company ID |

**Response:** Binary file download

- `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (xlsx)
- `Content-Type: text/csv` (csv)
- `Content-Disposition: attachment; filename="PAYE-Schedule-LA-March-2026.xlsx"`

#### Mark Schedule as Filed

```http
PUT /api/engine/tax-filing/monthly/{periodId}/{stateCode}
```

**Request Body:**

```typescript
{
  paymentReference?: string,  // Optional - Payment/receipt reference
  companyId?: string          // Required for Admin/Super_Admin
}
```

**Response:**

```typescript
{
  success: true,
  message: "Schedule marked as filed",
  data: {
    id: "clx...",
    status: "FILED",
    filedAt: "2026-03-15T10:30:00.000Z",
    filedBy: "user-id",
    paymentReference: "LIRS-2026-03-12345"
  }
}
```

---

### Annual Returns

#### Get Annual Filing Summary

```http
GET /api/engine/tax-filing/annual/{year}?companyId={companyId}
```

**Response:**

```typescript
{
  success: true,
  data: {
    year: 2026,
    periodsAvailable: [
      { id: "clx...", month: 1, status: "PAID" },
      { id: "clx...", month: 2, status: "PAID" },
      { id: "clx...", month: 3, status: "PAID" }
    ],
    returns: [
      {
        id: "clx...",
        stateCode: "LA",
        stateName: "Lagos",
        stateIrs: "LIRS",
        totalEmployees: 50,
        totalGrossIncome: 75000000.00,
        totalTaxPaid: 7500000.00,
        status: "GENERATED",
        filedAt: null,
        filedBy: null
      }
    ],
    summary: {
      totalStates: 5,
      totalEmployees: 150,
      totalTaxPaid: 22500000.00,
      totalGrossIncome: 225000000.00,
      returnsGenerated: true
    }
  }
}
```

#### Generate Annual Returns (Form H1)

```http
POST /api/engine/tax-filing/annual/{year}
```

**Request Body:**

```typescript
{
  companyId?: string  // Required for Admin/Super_Admin
}
```

**Response:**

```typescript
{
  success: true,
  message: "Generated 5 annual returns for 2026",
  data: {
    returns: [...],
    summary: {
      totalStates: 5,
      totalEmployees: 150,
      totalTaxPaid: 22500000.00,
      totalGrossIncome: 225000000.00
    }
  }
}
```

#### Get State Annual Return (Form H1 Data)

```http
GET /api/engine/tax-filing/annual/{year}/{stateCode}?companyId={companyId}
```

**Response:**

```typescript
{
  success: true,
  data: {
    formH1Data: {
      companyInfo: {
        id: "clx...",
        name: "ABC Company Ltd",
        taxId: "12345678-0001",
        address: "123 Lagos Street, Lagos"
      },
      year: 2026,
      stateCode: "LA",
      stateName: "Lagos",
      irsName: "LIRS",
      employees: [
        {
          sn: 1,
          taxpayerName: "DOE, John Adebayo",
          jtbTin: "1234-567-8901-3",
          staffId: "EMP001",
          annualGrossIncome: 6000000.00,
          annualTaxDeducted: 1020000.00,
          monthlyBreakdown: [
            { month: 1, grossIncome: 500000, taxPaid: 85000 },
            { month: 2, grossIncome: 500000, taxPaid: 85000 },
            // ... all 12 months
          ]
        }
      ],
      totals: {
        grossIncome: 75000000.00,
        totalTaxDeducted: 7500000.00,
        employeeCount: 50
      }
    },
    filingStatus: {
      status: "GENERATED",
      filedAt: null,
      filedBy: null
    }
  }
}
```

#### Download Form H1

```http
GET /api/engine/tax-filing/annual/{year}/{stateCode}/download?format={format}&companyId={companyId}
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| format | string | xlsx | Export format: `xlsx` or `csv` |
| companyId | string | - | Company ID |

**Response:** Binary file download

- `Content-Disposition: attachment; filename="Form-H1-LA-2026.xlsx"`

#### Mark Annual Return as Filed

```http
PUT /api/engine/tax-filing/annual/{year}/{stateCode}
```

**Request Body:**

```typescript
{
  companyId?: string  // Required for Admin/Super_Admin
}
```

---

### Tax Certificates

#### List Employees Eligible for Certificates

```http
POST /api/engine/tax-filing/annual/tax-certificates/{year}
```

**Request Body:**

```typescript
{
  companyId?: string  // Required for Admin/Super_Admin
}
```

**Response:**

```typescript
{
  success: true,
  message: "Found 150 employees eligible for tax certificates",
  data: {
    year: 2026,
    periodsCount: 12,
    employees: [
      {
        id: "clx...",
        staffId: "EMP001",
        name: "DOE, John",
        email: "john@company.com",
        stateOfResidence: "Lagos",
        jtbTin: "1234567890123",
        payslipsCount: 12
      }
    ],
    totalEmployees: 150
  }
}
```

#### Download Employee Tax Certificate

```http
GET /api/engine/tax-filing/annual/tax-certificates/{year}?staffId={staffId}&companyId={companyId}
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| staffId | string | Yes | Staff record ID |
| companyId | string | Admin only | Company ID |

**Response:** Binary Excel file download

- `Content-Disposition: attachment; filename="Tax-Certificate-Doe-John-2026.xlsx"`

**Certificate Contents:**
- Employee information (name, staff ID, TIN, state)
- Employer information (company name, tax ID, address)
- Annual summary (gross income, total PAYE, pension)
- Monthly breakdown (gross, pension, PAYE, net for each month)

---

### Dashboard

#### Get Filing Dashboard

```http
GET /api/engine/tax-filing/dashboard?companyId={companyId}
```

**Response:**

```typescript
{
  success: true,
  data: {
    currentPeriod: {
      id: "clx...",
      year: 2026,
      month: 3,
      periodName: "March 2026",
      status: "PAID"
    },
    currentMonthFiling: {
      totalStates: 5,
      generated: 5,
      filed: 3,
      pending: 2,
      totalTax: 7500000.00
    },
    annualSummary: {
      year: 2026,
      totalEmployees: 150,
      totalTaxPaid: 22500000.00,
      statesWithReturns: 5
    },
    taxProfiles: {
      total: 150,
      withTin: 140,
      withoutTin: 10,
      statesLocked: true,
      lockDate: "2026-01-01"
    },
    recentActivity: [
      {
        type: "SCHEDULE_GENERATED",
        state: "Lagos",
        date: "2026-03-10T09:00:00.000Z"
      },
      {
        type: "SCHEDULE_FILED",
        state: "Ogun",
        date: "2026-03-12T14:30:00.000Z"
      }
    ]
  }
}
```

---

### States Overview

#### List States with Employee Counts

```http
GET /api/engine/tax-filing/states?companyId={companyId}&includeEmpty={includeEmpty}
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| companyId | string | - | Company ID |
| includeEmpty | boolean | false | Include states with 0 employees |

**Response:**

```typescript
{
  success: true,
  data: {
    states: [
      {
        code: "LA",
        name: "Lagos",
        irsName: "LIRS",
        zone: "South West",
        employeeCount: 50
      },
      {
        code: "OG",
        name: "Ogun",
        irsName: "OGIRS",
        zone: "South West",
        employeeCount: 30
      }
    ],
    summary: {
      totalWithProfiles: 150,
      totalEmployees: 165,
      statesWithEmployees: 5
    }
  }
}
```

---

## TypeScript Interfaces

### Core Types

```typescript
// Nigeria State Type
type NigeriaState =
  | 'Abia' | 'Adamawa' | 'Akwa Ibom' | 'Anambra' | 'Bauchi' | 'Bayelsa'
  | 'Benue' | 'Borno' | 'Cross River' | 'Delta' | 'Ebonyi' | 'Edo'
  | 'Ekiti' | 'Enugu' | 'FCT' | 'Gombe' | 'Imo' | 'Jigawa' | 'Kaduna'
  | 'Kano' | 'Katsina' | 'Kebbi' | 'Kogi' | 'Kwara' | 'Lagos' | 'Nasarawa'
  | 'Niger' | 'Ogun' | 'Ondo' | 'Osun' | 'Oyo' | 'Plateau' | 'Rivers'
  | 'Sokoto' | 'Taraba' | 'Yobe' | 'Zamfara';

// Filing Status
type FilingStatus = 'PENDING' | 'GENERATED' | 'FILED' | 'CONFIRMED';

// Export Format
type ExportFormat = 'xlsx' | 'csv';
```

### Tax Profile

```typescript
interface EmployeeTaxProfile {
  id: string;
  staffId: string;
  companyId: string;
  stateOfResidence: NigeriaState;
  jtbTin: string | null;
  tinVerified: boolean;
  lockedState: string | null;
  lockedDate: Date | null;
  pfaName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TaxProfileInput {
  staffId: string;
  stateOfResidence: NigeriaState;
  jtbTin?: string;
  pfaName?: string;
}
```

### Monthly Schedule

```typescript
interface TaxFilingSchedule {
  id: string;
  companyId: string;
  payPeriodId: string;
  stateIrs: string;
  stateCode: string;
  stateName: string;
  totalEmployees: number;
  totalTaxAmount: number;
  totalGrossIncome: number;
  status: FilingStatus;
  filedAt: Date | null;
  filedBy: string | null;
  paymentReference: string | null;
  filePath: string | null;
}

interface MonthlyScheduleData {
  stateCode: string;
  stateName: string;
  irsName: string;
  period: { year: number; month: number };
  employees: EmployeeScheduleRow[];
  totals: {
    grossIncome: number;
    taxAmount: number;
    employeeCount: number;
  };
}

interface EmployeeScheduleRow {
  sn: number;
  taxpayerName: string;
  jtbTin: string;
  staffId: string;
  grossIncome: number;
  consolidatedRelief: number;
  rentRelief: number;
  pensionContribution: number;
  taxPayable: number;
  monthYear: string;
}
```

### Annual Return

```typescript
interface AnnualReturn {
  id: string;
  companyId: string;
  year: number;
  stateIrs: string;
  stateCode: string;
  stateName: string;
  totalEmployees: number;
  totalGrossIncome: number;
  totalTaxPaid: number;
  status: FilingStatus;
  filedAt: Date | null;
  filedBy: string | null;
  formH1FilePath: string | null;
}

interface FormH1Data {
  companyInfo: {
    id: string;
    name: string;
    taxId: string | null;
    address: string | null;
  };
  year: number;
  stateCode: string;
  stateName: string;
  irsName: string;
  employees: AnnualEmployeeRecord[];
  totals: {
    grossIncome: number;
    totalTaxDeducted: number;
    employeeCount: number;
  };
}

interface AnnualEmployeeRecord {
  sn: number;
  taxpayerName: string;
  jtbTin: string;
  staffId: string;
  annualGrossIncome: number;
  annualTaxDeducted: number;
  monthlyBreakdown: Array<{
    month: number;
    grossIncome: number;
    taxPaid: number;
  }>;
}
```

### Tax Certificate

```typescript
interface TaxCertificateData {
  employee: {
    id: string;
    staffId: string;
    name: string;
    email: string;
    jtbTin: string | null;
    stateOfResidence: string;
  };
  company: {
    name: string;
    taxId: string | null;
    address: string | null;
  };
  year: number;
  earnings: {
    totalGrossIncome: number;
    totalBasicSalary: number;
    totalAllowances: number;
  };
  deductions: {
    totalPension: number;
    totalNHF: number;
    totalNHIS: number;
    totalPAYE: number;
  };
  monthlyBreakdown: Array<{
    month: number;
    monthName: string;
    grossIncome: number;
    pension: number;
    paye: number;
    netSalary: number;
  }>;
}
```

---

## Nigeria States Reference

### All 36 States + FCT

| Code | State | IRS Name | Geopolitical Zone |
|------|-------|----------|-------------------|
| AB | Abia | ABIRS | South East |
| AD | Adamawa | ADIRS | North East |
| AK | Akwa Ibom | AKIRS | South South |
| AN | Anambra | ANIRS | South East |
| BA | Bauchi | BAIRS | North East |
| BY | Bayelsa | BYIRS | South South |
| BE | Benue | BEIRS | North Central |
| BO | Borno | BOIRS | North East |
| CR | Cross River | CRIRS | South South |
| DE | Delta | DEIRS | South South |
| EB | Ebonyi | EBIRS | South East |
| ED | Edo | EDIRS | South South |
| EK | Ekiti | EKIRS | South West |
| EN | Enugu | ENIRS | South East |
| FC | FCT | FCT-IRS | North Central |
| GO | Gombe | GOIRS | North East |
| IM | Imo | IMIRS | South East |
| JI | Jigawa | JIIRS | North West |
| KD | Kaduna | KDIRS | North West |
| KN | Kano | KNIRS | North West |
| KT | Katsina | KTIRS | North West |
| KE | Kebbi | KEIRS | North West |
| KO | Kogi | KOIRS | North Central |
| KW | Kwara | KWIRS | North Central |
| LA | Lagos | LIRS | South West |
| NA | Nasarawa | NAIRS | North Central |
| NI | Niger | NIIRS | North Central |
| OG | Ogun | OGIRS | South West |
| ON | Ondo | ONIRS | South West |
| OS | Osun | OSIRS | South West |
| OY | Oyo | OYIRS | South West |
| PL | Plateau | PLIRS | North Central |
| RI | Rivers | RIRS | South South |
| SO | Sokoto | SOIRS | North West |
| TA | Taraba | TAIRS | North East |
| YO | Yobe | YOIRS | North East |
| ZA | Zamfara | ZAIRS | North West |

---

## Frontend Implementation Examples

### React: Tax Profile Form

```tsx
import { useState } from 'react';
import { NIGERIA_STATES } from './constants';

interface TaxProfileFormProps {
  staffId: string;
  onSubmit: (data: TaxProfileInput) => void;
}

export function TaxProfileForm({ staffId, onSubmit }: TaxProfileFormProps) {
  const [form, setForm] = useState({
    stateOfResidence: '',
    jtbTin: '',
    pfaName: ''
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate TIN format (13 digits)
    if (form.jtbTin && !/^\d{13}$/.test(form.jtbTin.replace(/[-\s]/g, ''))) {
      setError('JTB TIN must be 13 digits');
      return;
    }

    try {
      const response = await fetch('/api/engine/tax-filing/profiles', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          staffId,
          ...form
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message);
      }

      onSubmit(form);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <select
        value={form.stateOfResidence}
        onChange={(e) => setForm({ ...form, stateOfResidence: e.target.value })}
        required
      >
        <option value="">Select State of Residence</option>
        {NIGERIA_STATES.map(state => (
          <option key={state.code} value={state.name}>
            {state.name}
          </option>
        ))}
      </select>

      <input
        type="text"
        placeholder="JTB TIN (13 digits)"
        value={form.jtbTin}
        onChange={(e) => setForm({ ...form, jtbTin: e.target.value })}
        pattern="\d{13}"
      />

      <input
        type="text"
        placeholder="Pension Fund Administrator"
        value={form.pfaName}
        onChange={(e) => setForm({ ...form, pfaName: e.target.value })}
      />

      {error && <div className="error">{error}</div>}

      <button type="submit">Save Tax Profile</button>
    </form>
  );
}
```

### React: Monthly Filing Dashboard

```tsx
import { useEffect, useState } from 'react';

interface MonthlyFilingProps {
  periodId: string;
  companyId: string;
}

export function MonthlyFiling({ periodId, companyId }: MonthlyFilingProps) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFilingSummary();
  }, [periodId]);

  const fetchFilingSummary = async () => {
    const response = await fetch(
      `/api/engine/tax-filing/monthly/${periodId}?companyId=${companyId}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const result = await response.json();
    setData(result.data);
    setLoading(false);
  };

  const generateSchedules = async () => {
    await fetch(`/api/engine/tax-filing/monthly/${periodId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ companyId })
    });
    fetchFilingSummary();
  };

  const downloadSchedule = (stateCode: string, format: 'xlsx' | 'csv') => {
    const url = `/api/engine/tax-filing/monthly/${periodId}/${stateCode}/download?format=${format}&companyId=${companyId}`;
    window.open(url, '_blank');
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h2>{data.period.periodName} - Tax Filing</h2>

      <div className="summary">
        <p>Total States: {data.summary.totalStates}</p>
        <p>Total Employees: {data.summary.totalEmployees}</p>
        <p>Total Tax: ₦{data.summary.totalTaxAmount.toLocaleString()}</p>
        {data.summary.missingEmployeesCount > 0 && (
          <p className="warning">
            {data.summary.missingEmployeesCount} employees missing tax profiles
          </p>
        )}
      </div>

      {!data.summary.schedulesGenerated && (
        <button onClick={generateSchedules}>
          Generate Schedules
        </button>
      )}

      <table>
        <thead>
          <tr>
            <th>State</th>
            <th>IRS</th>
            <th>Employees</th>
            <th>Tax Amount</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.schedules.map(schedule => (
            <tr key={schedule.id}>
              <td>{schedule.stateName}</td>
              <td>{schedule.stateIrs}</td>
              <td>{schedule.totalEmployees}</td>
              <td>₦{schedule.totalTaxAmount.toLocaleString()}</td>
              <td>
                <span className={`status-${schedule.status.toLowerCase()}`}>
                  {schedule.status}
                </span>
              </td>
              <td>
                <button onClick={() => downloadSchedule(schedule.stateCode, 'xlsx')}>
                  Excel
                </button>
                <button onClick={() => downloadSchedule(schedule.stateCode, 'csv')}>
                  CSV
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### API Service Class

```typescript
class TaxFilingService {
  private baseUrl = '/api/engine/tax-filing';
  private token: string;
  private companyId: string;

  constructor(token: string, companyId: string) {
    this.token = token;
    this.companyId = companyId;
  }

  private headers() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  // Tax Profiles
  async getProfiles(options?: { page?: number; state?: string }) {
    const params = new URLSearchParams({ companyId: this.companyId });
    if (options?.page) params.set('page', options.page.toString());
    if (options?.state) params.set('state', options.state);

    const response = await fetch(`${this.baseUrl}/profiles?${params}`, {
      headers: this.headers()
    });
    return response.json();
  }

  async createProfile(data: TaxProfileInput) {
    const response = await fetch(`${this.baseUrl}/profiles`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ ...data, companyId: this.companyId })
    });
    return response.json();
  }

  async lockStates(year: number) {
    const response = await fetch(`${this.baseUrl}/profiles/lock-states`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ year, companyId: this.companyId })
    });
    return response.json();
  }

  // Monthly Filing
  async getMonthlyFiling(periodId: string) {
    const response = await fetch(
      `${this.baseUrl}/monthly/${periodId}?companyId=${this.companyId}`,
      { headers: this.headers() }
    );
    return response.json();
  }

  async generateMonthlySchedules(periodId: string) {
    const response = await fetch(`${this.baseUrl}/monthly/${periodId}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ companyId: this.companyId })
    });
    return response.json();
  }

  async markScheduleFiled(periodId: string, stateCode: string, paymentRef?: string) {
    const response = await fetch(
      `${this.baseUrl}/monthly/${periodId}/${stateCode}`,
      {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify({
          companyId: this.companyId,
          paymentReference: paymentRef
        })
      }
    );
    return response.json();
  }

  getScheduleDownloadUrl(periodId: string, stateCode: string, format: 'xlsx' | 'csv') {
    return `${this.baseUrl}/monthly/${periodId}/${stateCode}/download?format=${format}&companyId=${this.companyId}`;
  }

  // Annual Returns
  async getAnnualFiling(year: number) {
    const response = await fetch(
      `${this.baseUrl}/annual/${year}?companyId=${this.companyId}`,
      { headers: this.headers() }
    );
    return response.json();
  }

  async generateAnnualReturns(year: number) {
    const response = await fetch(`${this.baseUrl}/annual/${year}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ companyId: this.companyId })
    });
    return response.json();
  }

  getFormH1DownloadUrl(year: number, stateCode: string, format: 'xlsx' | 'csv') {
    return `${this.baseUrl}/annual/${year}/${stateCode}/download?format=${format}&companyId=${this.companyId}`;
  }

  getTaxCertificateUrl(year: number, staffId: string) {
    return `${this.baseUrl}/annual/tax-certificates/${year}?staffId=${staffId}&companyId=${this.companyId}`;
  }

  // Dashboard
  async getDashboard() {
    const response = await fetch(
      `${this.baseUrl}/dashboard?companyId=${this.companyId}`,
      { headers: this.headers() }
    );
    return response.json();
  }

  // States
  async getStates(includeEmpty = false) {
    const response = await fetch(
      `${this.baseUrl}/states?companyId=${this.companyId}&includeEmpty=${includeEmpty}`,
      { headers: this.headers() }
    );
    return response.json();
  }
}
```

---

## Appendix: JTB TIN Format

The Joint Tax Board (JTB) Tax Identification Number is a 13-digit number:

```
Format: XXXXXXXXXXXXX (13 digits)
Display: XXXX-XXX-XXXX-X (formatted with dashes)
```

**Validation Rules:**
- Must be exactly 13 digits
- Only numeric characters allowed
- Leading zeros are valid

**Example:**
- Raw: `1234567890123`
- Formatted: `1234-567-8901-3`
