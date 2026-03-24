# Payroll Engine Bulk Upload API Documentation

This document describes the bulk upload APIs for the payroll engine module. All endpoints support both **Excel file uploads** and **JSON data** submission.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Download Templates](#download-templates)
3. [Employee Salary Import](#employee-salary-import)
4. [Overtime Upload](#overtime-upload)
5. [Deductions Upload](#deductions-upload)
6. [Bulk Validations](#bulk-validations)
7. [Error Handling](#error-handling)
8. [Frontend Implementation Examples](#frontend-implementation-examples)

---

## Authentication

All endpoints require Bearer token authentication.

```
Authorization: Bearer <token>
```

**Required Roles:**
- Employee Salary Import: `SUPER_ADMIN`, `ADMIN`
- Overtime Upload: `SUPER_ADMIN`, `ADMIN`
- Deductions Upload: `SUPER_ADMIN`, `ADMIN`
- Bulk Validations: `SUPER_ADMIN`, `ADMIN`, `MANAGER`
- Download Templates: `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `HR`

---

## Download Templates

Download Excel templates for bulk uploads.

### Endpoint

```
GET /api/engine/templates?type={TEMPLATE_TYPE}
```

### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `type` | No | Template type: `EMPLOYEE_SALARY`, `OVERTIME`, `DEDUCTIONS`, `VALIDATIONS` |
| `deductionType` | No | For DEDUCTIONS template: `UNION_DUES`, `COOPERATIVE`, `LOAN`, `SALARY_ADVANCE`, `OTHER` |

### Get Available Templates

```
GET /api/engine/templates
```

**Response:**
```json
{
  "success": true,
  "message": "Available payroll engine bulk upload templates",
  "templates": [
    {
      "type": "EMPLOYEE_SALARY",
      "description": "Bulk import employee salary structures",
      "endpoint": "/api/engine/employee-salaries/import",
      "columns": {
        "required": ["staffId", "basicSalary"],
        "optional": ["employeeCategory", "housingAllowance", ...]
      }
    },
    ...
  ]
}
```

### Download Specific Template

```
GET /api/engine/templates?type=EMPLOYEE_SALARY
GET /api/engine/templates?type=OVERTIME
GET /api/engine/templates?type=DEDUCTIONS&deductionType=LOAN
GET /api/engine/templates?type=VALIDATIONS
```

**Response:** Excel file download (`.xlsx`)

### Frontend Example

```typescript
const downloadTemplate = async (type: string, deductionType?: string) => {
  const params = new URLSearchParams({ type });
  if (deductionType) params.append('deductionType', deductionType);

  const response = await fetch(`/api/engine/templates?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${type.toLowerCase()}-template.xlsx`;
  a.click();
};
```

---

## Employee Salary Import

Bulk import employee salary structures.

### Endpoint

```
POST /api/engine/employee-salaries/import
```

### Option 1: File Upload (Recommended)

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | Excel (.xlsx, .xls) or CSV file |

**Template Columns:**

| Column | Required | Type | Description |
|--------|----------|------|-------------|
| `staffId` | Yes | String | Unique staff identifier |
| `basicSalary` | Yes | Number | Monthly basic salary |
| `employeeCategory` | No | String | `REGULAR` or `CONTRACT` |
| `housingAllowance` | No | Number | Monthly housing allowance |
| `transportAllowance` | No | Number | Monthly transport allowance |
| `dressingAllowance` | No | Number | Monthly dressing allowance |
| `leaveAllowance` | No | Number | Monthly leave allowance |
| `entertainmentAllowance` | No | Number | Monthly entertainment allowance |
| `utilityAllowance` | No | Number | Monthly utility allowance |
| `otherAllowances` | No | Number | Other monthly allowances |
| `annualRent` | No | Number | Annual rent for tax relief |
| `bankName` | No | String | Employee bank name |
| `accountNumber` | No | String | Bank account number |
| `accountName` | No | String | Account holder name |
| `pensionFundAdministrator` | No | String | PFA name |
| `pensionPin` | No | String | RSA PIN number |
| `effectiveDate` | No | String | Format: `YYYY-MM-DD` |

### Option 2: JSON Data

**Content-Type:** `application/json`

```json
{
  "data": [
    {
      "staffId": "EMP001",
      "basicSalary": 350000,
      "housingAllowance": 75000,
      "transportAllowance": 30000
    },
    {
      "staffId": "EMP002",
      "basicSalary": 280000
    }
  ]
}
```

### Response

```json
{
  "success": true,
  "message": "Import completed: 5 created, 2 updated",
  "data": {
    "created": 5,
    "updated": 2,
    "errors": [],
    "totalProcessed": 7
  }
}
```

### Frontend Example (File Upload)

```typescript
const uploadSalaryStructures = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/engine/employee-salaries/import', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });

  return response.json();
};
```

---

## Overtime Upload

Upload overtime entries for a specific pay period.

### Endpoint

```
POST /api/engine/overtime/upload/{periodId}
```

### Path Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `periodId` | Yes | Pay period ID |

### Option 1: File Upload (Recommended)

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | Excel (.xlsx, .xls) or CSV file |
| `sourceFileId` | String | No | Optional file tracking ID |

**Template Columns:**

| Column | Required | Type | Description |
|--------|----------|------|-------------|
| `staffId` | Yes | String | Unique staff identifier |
| `overtimeHours` | Yes | Number | Number of overtime hours |
| `multiplier` | No | Number | Rate multiplier (default: 1.5) |
| `description` | No | String | Description of overtime work |

### Option 2: JSON Data

**Content-Type:** `application/json`

```json
{
  "data": [
    {
      "staffId": "EMP001",
      "overtimeHours": 10,
      "multiplier": 1.5,
      "description": "Weekend work"
    }
  ],
  "sourceFileId": "optional-tracking-id"
}
```

### Response

```json
{
  "success": true,
  "message": "3 overtime entries imported successfully",
  "data": {
    "created": 3,
    "errors": [],
    "totalProcessed": 3
  }
}
```

### Frontend Example

```typescript
const uploadOvertime = async (periodId: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`/api/engine/overtime/upload/${periodId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });

  return response.json();
};
```

---

## Deductions Upload

Upload deduction entries for a specific pay period and deduction type.

### Endpoint

```
POST /api/engine/deductions/upload/{periodId}?type={DEDUCTION_TYPE}
```

### Path Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `periodId` | Yes | Pay period ID |

### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `type` | Yes | Deduction type: `UNION_DUES`, `COOPERATIVE`, `LOAN`, `SALARY_ADVANCE`, `OTHER` |

### Option 1: File Upload (Recommended)

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | Excel (.xlsx, .xls) or CSV file |
| `sourceFileId` | String | No | Optional file tracking ID |

**Template Columns:**

| Column | Required | Type | Description |
|--------|----------|------|-------------|
| `staffId` | Yes | String | Unique staff identifier |
| `amount` | Yes | Number | Deduction amount (positive value) |
| `description` | No | String | Description/reason for deduction |

### Option 2: JSON Data

**Content-Type:** `application/json`

```json
{
  "data": [
    {
      "staffId": "EMP001",
      "amount": 5000,
      "description": "Monthly union dues"
    }
  ]
}
```

### Response

```json
{
  "success": true,
  "message": "3 deduction entries imported successfully",
  "data": {
    "created": 3,
    "errors": [],
    "totalProcessed": 3,
    "deductionType": "UNION_DUES"
  }
}
```

### Frontend Example

```typescript
const uploadDeductions = async (
  periodId: string,
  deductionType: string,
  file: File
) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(
    `/api/engine/deductions/upload/${periodId}?type=${deductionType}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    }
  );

  return response.json();
};
```

---

## Bulk Validations

Bulk validate staff payment status for a pay period.

### Endpoint

```
POST /api/engine/validations?action=bulk
```

### Option 1: File Upload (Recommended)

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | Excel (.xlsx, .xls) or CSV file |
| `payPeriodId` | String | Yes | Pay period ID |

**Template Columns:**

| Column | Required | Type | Description |
|--------|----------|------|-------------|
| `staffId` | Yes | String | Unique staff identifier |
| `status` | Yes | String | `YES_FOR_PAYMENT` or `NO_FOR_PAYMENT` |
| `reason` | No | String | Reason (required for NO_FOR_PAYMENT) |

**Accepted Status Values:**
- For approval: `YES_FOR_PAYMENT`, `YES`, `APPROVED`, `APPROVE`
- For rejection: `NO_FOR_PAYMENT`, `NO`, `REJECTED`, `REJECT`, `WITHHELD`, `WITHHOLD`

### Option 2: JSON Data

**Content-Type:** `application/json`

```json
{
  "payPeriodId": "period-id-123",
  "validations": [
    {
      "staffId": "EMP001",
      "status": "YES_FOR_PAYMENT"
    },
    {
      "staffId": "EMP002",
      "status": "NO_FOR_PAYMENT",
      "reason": "On suspension"
    }
  ]
}
```

### Response

```json
{
  "success": true,
  "message": "5 staff members validated successfully",
  "data": {
    "updated": 5,
    "errors": [],
    "totalProcessed": 5
  }
}
```

### Frontend Example

```typescript
const bulkValidate = async (payPeriodId: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('payPeriodId', payPeriodId);

  const response = await fetch('/api/engine/validations?action=bulk', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });

  return response.json();
};
```

---

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "message": "Error description",
  "data": {
    "created": 3,
    "updated": 0,
    "errors": [
      "Staff EMP001: Staff record not found",
      "Staff EMP002: Invalid salary amount"
    ]
  }
}
```

### Common Errors

| HTTP Code | Message | Description |
|-----------|---------|-------------|
| 400 | No file uploaded | File field is missing |
| 400 | Invalid file type | File is not Excel/CSV |
| 400 | Missing required column: X | Required column not found in file |
| 400 | No valid data found | File has no processable rows |
| 401 | Authorization header missing | Token not provided |
| 403 | Insufficient permissions | User role not authorized |
| 500 | Failed to import | Server-side processing error |

---

## Frontend Implementation Examples

### Complete React Component Example

```tsx
import React, { useState, useRef } from 'react';

type UploadType = 'EMPLOYEE_SALARY' | 'OVERTIME' | 'DEDUCTIONS' | 'VALIDATIONS';

interface UploadResult {
  success: boolean;
  message: string;
  data?: {
    created?: number;
    updated?: number;
    errors?: string[];
    totalProcessed?: number;
  };
}

export const BulkUploader: React.FC<{
  type: UploadType;
  periodId?: string;
  deductionType?: string;
  token: string;
}> = ({ type, periodId, deductionType, token }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = async () => {
    const params = new URLSearchParams({ type });
    if (deductionType) params.append('deductionType', deductionType);

    const response = await fetch(`/api/engine/templates?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to download template');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type.toLowerCase()}-template.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const getUploadUrl = (): string => {
    switch (type) {
      case 'EMPLOYEE_SALARY':
        return '/api/engine/employee-salaries/import';
      case 'OVERTIME':
        return `/api/engine/overtime/upload/${periodId}`;
      case 'DEDUCTIONS':
        return `/api/engine/deductions/upload/${periodId}?type=${deductionType}`;
      case 'VALIDATIONS':
        return '/api/engine/validations?action=bulk';
      default:
        throw new Error('Invalid upload type');
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // For validations, also add payPeriodId
      if (type === 'VALIDATIONS' && periodId) {
        formData.append('payPeriodId', periodId);
      }

      const response = await fetch(getUploadUrl(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Upload failed'
      });
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="bulk-uploader">
      <div className="actions">
        <button onClick={downloadTemplate} disabled={isLoading}>
          Download Template
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleUpload}
          disabled={isLoading}
        />
      </div>

      {isLoading && <div className="loading">Processing...</div>}

      {result && (
        <div className={`result ${result.success ? 'success' : 'error'}`}>
          <p>{result.message}</p>
          {result.data && (
            <ul>
              {result.data.created !== undefined && (
                <li>Created: {result.data.created}</li>
              )}
              {result.data.updated !== undefined && (
                <li>Updated: {result.data.updated}</li>
              )}
              {result.data.totalProcessed !== undefined && (
                <li>Total Processed: {result.data.totalProcessed}</li>
              )}
              {result.data.errors?.length > 0 && (
                <li>
                  Errors:
                  <ul>
                    {result.data.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
```

### Usage Examples

```tsx
// Employee Salary Import
<BulkUploader type="EMPLOYEE_SALARY" token={authToken} />

// Overtime Upload
<BulkUploader type="OVERTIME" periodId="period-123" token={authToken} />

// Deductions Upload (Loan type)
<BulkUploader
  type="DEDUCTIONS"
  periodId="period-123"
  deductionType="LOAN"
  token={authToken}
/>

// Bulk Validations
<BulkUploader type="VALIDATIONS" periodId="period-123" token={authToken} />
```

---

## API Endpoints Summary

| Feature | Method | Endpoint | Content-Type |
|---------|--------|----------|--------------|
| Get Templates List | GET | `/api/engine/templates` | - |
| Download Template | GET | `/api/engine/templates?type=X` | - |
| Employee Salary Import | POST | `/api/engine/employee-salaries/import` | multipart/form-data or JSON |
| Overtime Upload | POST | `/api/engine/overtime/upload/{periodId}` | multipart/form-data or JSON |
| Deductions Upload | POST | `/api/engine/deductions/upload/{periodId}?type=X` | multipart/form-data or JSON |
| Bulk Validations | POST | `/api/engine/validations?action=bulk` | multipart/form-data or JSON |

---

## Notes

1. **File Size Limits:** Default server limit applies. For large files, consider chunking or increasing server limits.

2. **Column Matching:** The API uses fuzzy column matching, so variations like `Staff ID`, `staffId`, `STAFFID` will all be recognized.

3. **Instruction Rows:** Rows starting with "IMPORTANT", "REQUIRED", "-", or containing "TEMPLATE"/"INSTRUCTIONS" are automatically skipped.

4. **Existing Records:** For salary structures, existing records are updated. For overtime/deductions, new entries are always created.

5. **Validation Window:** For bulk validations, the pay period's validation window must be open.
