# Tax Profile - Frontend Integration Guide

## Overview

This guide explains how to integrate the Tax Profile section with the existing Staff module using the new `staff-lookup` endpoint.

---

## Staff Selection for Tax Profile Creation

### The Problem

When creating a tax profile, the frontend needs to:
1. Show a dropdown of available staff members
2. Know which staff already have tax profiles
3. Use the correct identifier when calling the create API

### The Solution

Use the new **Staff Lookup** endpoint which provides staff data formatted for dropdown selection.

---

## API Endpoint

```
GET /api/engine/tax-filing/profiles/staff-lookup
```

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `companyId` | string | Admin only | - | Company ID (HR role auto-populated) |
| `withoutProfile` | boolean | No | false | Only return staff without tax profiles |
| `search` | string | No | - | Search by name, staffId, or email |
| `limit` | number | No | 500 | Maximum results to return |

### Response Structure

```typescript
interface StaffLookupResponse {
  success: boolean;
  message: string;
  data: {
    staff: StaffLookupItem[];
    summary: {
      total: number;
      withTaxProfile: number;
      withoutTaxProfile: number;
    };
  };
}

interface StaffLookupItem {
  // Identifiers
  id: string;              // UUID - USE THIS for API calls
  staffId: string;         // Employee ID (e.g., "EMP001") - display to user

  // Employee Info
  fullName: string;        // "John Doe"
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  position: string;

  // Tax Profile Status
  hasTaxProfile: boolean;
  taxProfile: {
    id: string;
    stateOfResidence: string;
    hasJtbTin: boolean;
  } | null;

  // Dropdown Helpers
  label: string;           // "EMP001 - John Doe" - use as dropdown label
  value: string;           // Same as id - use as dropdown value
}
```

---

## Implementation Examples

### 1. Basic Staff Dropdown (React)

```tsx
import { useState, useEffect } from 'react';
import axios from 'axios';

function StaffDropdown({ onSelect }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    try {
      const response = await axios.get(
        '/api/engine/tax-filing/profiles/staff-lookup',
        {
          params: { withoutProfile: true, limit: 500 },
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setStaff(response.data.data.staff);
    } catch (error) {
      console.error('Failed to fetch staff:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <select onChange={(e) => onSelect(e.target.value)} disabled={loading}>
      <option value="">Select Employee</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
```

### 2. Searchable Dropdown (with react-select)

```tsx
import Select from 'react-select';
import { useState, useEffect } from 'react';
import axios from 'axios';

function StaffSearchableDropdown({ onSelect, showOnlyWithoutProfile = true }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    fetchStaff();
  }, [showOnlyWithoutProfile]);

  const fetchStaff = async () => {
    try {
      const response = await axios.get(
        '/api/engine/tax-filing/profiles/staff-lookup',
        {
          params: {
            withoutProfile: showOnlyWithoutProfile,
            limit: 500
          },
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const { staff, summary } = response.data.data;

      // Format for react-select
      setOptions(staff.map(s => ({
        value: s.id,          // UUID for API calls
        label: s.label,       // "EMP001 - John Doe"
        staffId: s.staffId,   // For display
        email: s.email,
        department: s.department,
        hasTaxProfile: s.hasTaxProfile
      })));

      setSummary(summary);
    } catch (error) {
      console.error('Failed to fetch staff:', error);
    } finally {
      setLoading(false);
    }
  };

  // Custom option display
  const formatOptionLabel = ({ label, email, department, hasTaxProfile }) => (
    <div className="flex justify-between items-center">
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-sm text-gray-500">{email} | {department}</div>
      </div>
      {hasTaxProfile && (
        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
          Has Profile
        </span>
      )}
    </div>
  );

  return (
    <div>
      <Select
        options={options}
        isLoading={loading}
        onChange={(selected) => onSelect(selected?.value)}
        formatOptionLabel={formatOptionLabel}
        placeholder="Search by name, ID, or email..."
        isClearable
        isSearchable
      />
      {summary && (
        <div className="text-sm text-gray-500 mt-1">
          {summary.withoutTaxProfile} employees need tax profiles
        </div>
      )}
    </div>
  );
}
```

### 3. Complete Tax Profile Form

```tsx
import { useState } from 'react';
import axios from 'axios';

const NIGERIA_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
  'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi',
  'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun',
  'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'
];

function CreateTaxProfileForm({ onSuccess }) {
  const [formData, setFormData] = useState({
    staffId: '',           // This will be the UUID from staff-lookup
    stateOfResidence: '',
    jtbTin: '',
    pfaName: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(
        '/api/engine/tax-filing/profiles',
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      onSuccess(response.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Staff Selection */}
      <div>
        <label className="block text-sm font-medium">Employee *</label>
        <StaffSearchableDropdown
          onSelect={(id) => setFormData({ ...formData, staffId: id })}
          showOnlyWithoutProfile={true}
        />
      </div>

      {/* State of Residence */}
      <div>
        <label className="block text-sm font-medium">State of Residence *</label>
        <select
          value={formData.stateOfResidence}
          onChange={(e) => setFormData({ ...formData, stateOfResidence: e.target.value })}
          required
          className="mt-1 block w-full rounded border-gray-300"
        >
          <option value="">Select State</option>
          {NIGERIA_STATES.map(state => (
            <option key={state} value={state}>{state}</option>
          ))}
        </select>
      </div>

      {/* JTB TIN (Optional) */}
      <div>
        <label className="block text-sm font-medium">JTB TIN</label>
        <input
          type="text"
          value={formData.jtbTin}
          onChange={(e) => setFormData({ ...formData, jtbTin: e.target.value })}
          placeholder="13-digit Tax ID"
          maxLength={13}
          pattern="[0-9]{13}"
          className="mt-1 block w-full rounded border-gray-300"
        />
        <p className="text-xs text-gray-500 mt-1">Optional - 13 digit number</p>
      </div>

      {/* PFA Name (Optional) */}
      <div>
        <label className="block text-sm font-medium">Pension Fund Administrator</label>
        <input
          type="text"
          value={formData.pfaName}
          onChange={(e) => setFormData({ ...formData, pfaName: e.target.value })}
          placeholder="e.g., ARM Pension"
          className="mt-1 block w-full rounded border-gray-300"
        />
      </div>

      {error && (
        <div className="text-red-600 text-sm">{error}</div>
      )}

      <button
        type="submit"
        disabled={loading || !formData.staffId || !formData.stateOfResidence}
        className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50"
      >
        {loading ? 'Creating...' : 'Create Tax Profile'}
      </button>
    </form>
  );
}
```

---

## TaxFilingService.js

Create a service file to centralize API calls:

```javascript
// src/services/TaxFilingService.js

import axios from './axios';

const BASE_URL = '/api/engine/tax-filing';

export const TaxFilingService = {
  // Staff Lookup
  getStaffForDropdown: async (params = {}) => {
    const response = await axios.get(`${BASE_URL}/profiles/staff-lookup`, {
      params: {
        withoutProfile: params.withoutProfile ?? true,
        search: params.search,
        limit: params.limit ?? 500,
        companyId: params.companyId
      }
    });
    return response.data;
  },

  // Tax Profiles
  listProfiles: async (params = {}) => {
    const response = await axios.get(`${BASE_URL}/profiles`, { params });
    return response.data;
  },

  getProfile: async (staffId, companyId) => {
    const response = await axios.get(`${BASE_URL}/profiles/${staffId}`, {
      params: { companyId }
    });
    return response.data;
  },

  createProfile: async (data) => {
    const response = await axios.post(`${BASE_URL}/profiles`, data);
    return response.data;
  },

  updateProfile: async (staffId, data) => {
    const response = await axios.put(`${BASE_URL}/profiles/${staffId}`, data);
    return response.data;
  },

  deleteProfile: async (staffId, companyId) => {
    const response = await axios.delete(`${BASE_URL}/profiles/${staffId}`, {
      params: { companyId }
    });
    return response.data;
  },

  // Bulk Import
  uploadProfiles: async (file, companyId) => {
    const formData = new FormData();
    formData.append('file', file);
    if (companyId) formData.append('companyId', companyId);

    const response = await axios.post(`${BASE_URL}/profiles/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  downloadTemplate: async () => {
    const response = await axios.get(`${BASE_URL}/profiles/template`, {
      responseType: 'blob'
    });
    return response.data;
  },

  // Lock States
  lockStates: async (year, companyId) => {
    const response = await axios.post(`${BASE_URL}/profiles/lock-states`, {
      year,
      companyId
    });
    return response.data;
  }
};

export default TaxFilingService;
```

---

## Key Points

### 1. Staff ID vs UUID

| Field | Example | Use For |
|-------|---------|---------|
| `id` (UUID) | `clx123abc...` | API calls (create, update, delete) |
| `staffId` | `EMP001` | Display to users |

**Always use `id` (UUID) when making API calls to create/update tax profiles.**

### 2. Integration with Existing Staff List

The staff-lookup endpoint uses the same data as `/api/engine/staff?limit=500`. The difference:
- `staff-lookup` includes tax profile status
- `staff-lookup` provides dropdown-ready formatting
- `staff-lookup` can filter to only staff without profiles

### 3. Dual Identifier Support

The Create Profile API now accepts either:
```javascript
// Using UUID (recommended - from staff-lookup)
{ staffId: "clx123abc...", stateOfResidence: "Lagos" }

// Using Employee ID (also works)
{ staffId: "EMP001", stateOfResidence: "Lagos" }
```

Both will resolve to the same employee.

---

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `Staff member not found` | Invalid staffId | Refresh staff list and re-select |
| `Tax profile already exists` | Duplicate profile | Edit existing profile instead |
| `Invalid state of residence` | Typo in state name | Use exact state names from list |
| `Invalid JTB TIN` | Wrong format | Must be exactly 13 digits |

---

## Testing Checklist

- [ ] Staff dropdown loads correctly
- [ ] Search filters staff list
- [ ] `withoutProfile=true` hides staff with profiles
- [ ] Creating profile with UUID works
- [ ] Creating profile with Employee ID works
- [ ] Error messages display correctly
- [ ] Profile appears in list after creation
