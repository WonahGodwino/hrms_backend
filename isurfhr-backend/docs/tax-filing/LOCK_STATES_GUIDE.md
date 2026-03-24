# State Locking Logic - Technical Guide

## Overview

The State Locking feature implements the **January 1st Rule** as mandated by the **Personal Income Tax Act (PITA)** of Nigeria. This ensures employees are taxed correctly based on their state of residence at the start of each tax year.

---

## Legal Background

### PITA Requirement

Under Nigerian tax law, an employee's PAYE (Pay-As-You-Earn) tax must be remitted to the **State Internal Revenue Service (IRS)** of their **state of residence as at January 1st** of the tax year.

Key points:
- Tax residency is determined on January 1st of each year
- Once locked, the state cannot change for that entire tax year
- All monthly PAYE remittances go to the locked state's IRS
- Employee can physically relocate, but tax state remains locked

### Example Scenario

```
Employee: John Doe
Jan 1, 2026: Lives in Lagos → State locked as Lagos
March 2026: Relocates to Abuja (FCT)
Tax Remittance: All 2026 PAYE goes to LIRS (Lagos), not FCT-IRS

Jan 1, 2027: Lives in FCT → State locked as FCT for 2027
Tax Remittance: All 2027 PAYE goes to FCT-IRS
```

---

## Database Schema

### EmployeeTaxProfile Model

```prisma
model EmployeeTaxProfile {
  id                  String    @id @default(cuid())
  staffId             String    @unique
  companyId           String
  stateOfResidence    String    // Current state (can be updated anytime)
  jtbTin              String?
  tinVerified         Boolean   @default(false)
  lockedState         String?   // State locked on Jan 1st (immutable for year)
  lockedDate          DateTime? // When the state was locked
  pfaName             String?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  staff               StaffRecord @relation(...)
  company             Company     @relation(...)
}
```

### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `stateOfResidence` | String | Current state - can be updated anytime |
| `lockedState` | String? | State locked on Jan 1st - immutable for year |
| `lockedDate` | DateTime? | Date when state was locked |

---

## How State Locking Works

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     STATE LOCKING LIFECYCLE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  BEFORE JAN 1ST                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Employee Profile:                                              │   │
│  │   stateOfResidence: "Lagos"                                   │   │
│  │   lockedState: null                                           │   │
│  │   lockedDate: null                                            │   │
│  │                                                                │   │
│  │ → Employee can freely change stateOfResidence                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  JANUARY 1ST (Lock States API called)                               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Employee Profile:                                              │   │
│  │   stateOfResidence: "Lagos"                                   │   │
│  │   lockedState: "Lagos"        ← Copied from stateOfResidence  │   │
│  │   lockedDate: "2026-01-01"    ← Lock date recorded            │   │
│  │                                                                │   │
│  │ → stateOfResidence can still change, but tax uses lockedState │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  REST OF THE YEAR                                                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Employee moves to FCT in March:                               │   │
│  │   stateOfResidence: "FCT"     ← Updated to new location       │   │
│  │   lockedState: "Lagos"        ← UNCHANGED (locked)            │   │
│  │   lockedDate: "2026-01-01"                                    │   │
│  │                                                                │   │
│  │ → Tax filing uses "Lagos" (lockedState), not "FCT"            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### State Resolution Logic

The system uses `getEffectiveState()` to determine which state to use for tax filing:

```typescript
/**
 * Get the effective state for tax filing
 * Returns locked state if available, otherwise current state
 */
export function getEffectiveState(profile: EmployeeTaxProfile): string {
  return profile.lockedState || profile.stateOfResidence
}
```

**Priority:**
1. If `lockedState` exists → Use `lockedState`
2. If `lockedState` is null → Use `stateOfResidence`

---

## API Endpoints

### Lock States for Year

```http
POST /api/engine/tax-filing/profiles/lock-states
```

**Request Body:**

```json
{
  "year": 2026,
  "companyId": "optional-for-admin"
}
```

**Response:**

```json
{
  "success": true,
  "message": "States locked for 2026",
  "data": {
    "locked": 45,          // Newly locked profiles
    "skipped": 0,          // Profiles that failed to lock
    "alreadyLocked": 10,   // Previously locked profiles
    "errors": []
  }
}
```

### Behavior

1. **First call of the year**: Locks all unlocked profiles
2. **Subsequent calls**: Returns count of already locked profiles
3. **Idempotent**: Safe to call multiple times

---

## Implementation Details

### lockStatesForYear Function

```typescript
export async function lockStatesForYear(
  companyId: string,
  year: number
): Promise<LockStatesResponse> {
  const lockDate = new Date(year, 0, 1)  // January 1st

  // Get all profiles that don't have a locked state yet
  const profilesToLock = await prisma.employeeTaxProfile.findMany({
    where: {
      companyId,
      lockedState: null,  // Only unlocked profiles
    },
  })

  // Get already locked count
  const alreadyLocked = await prisma.employeeTaxProfile.count({
    where: {
      companyId,
      lockedState: { not: null },
    },
  })

  let locked = 0
  let skipped = 0

  for (const profile of profilesToLock) {
    try {
      await prisma.employeeTaxProfile.update({
        where: { id: profile.id },
        data: {
          lockedState: profile.stateOfResidence,  // Copy current state
          lockedDate: lockDate,
        },
      })
      locked++
    } catch (error) {
      skipped++
    }
  }

  return { locked, skipped, alreadyLocked, errors: [] }
}
```

### Update Protection

When updating a tax profile, the system prevents state changes if locked:

```typescript
export async function updateTaxProfile(
  staffId: string,
  companyId: string,
  update: EmployeeTaxProfileUpdate
): Promise<EmployeeTaxProfile> {
  const existing = await prisma.employeeTaxProfile.findFirst({
    where: { staffId, companyId },
  })

  // Check if state is locked
  if (update.stateOfResidence !== undefined) {
    if (existing.lockedState && existing.lockedDate) {
      throw new Error(
        `Cannot change state of residence. State was locked on ${
          existing.lockedDate.toISOString().split('T')[0]
        } per PITA rules.`
      )
    }
  }

  // ... continue with update
}
```

---

## Tax Filing Integration

### Monthly Schedule Generation

When generating monthly PAYE schedules, the system routes employees by their **effective state**:

```typescript
export async function routeByResidency(
  companyId: string,
  periodId: string
): Promise<Map<string, EmployeeScheduleRow[]>> {
  // Get payslips with tax profiles
  const payslips = await prisma.computedPayslip.findMany({
    where: { companyId, payPeriodId: periodId },
    include: {
      staff: { include: { taxProfile: true } },
    },
  })

  const stateGroups = new Map<string, EmployeeScheduleRow[]>()

  for (const payslip of payslips) {
    const taxProfile = payslip.staff.taxProfile
    if (!taxProfile) continue

    // Use effective state (locked or current)
    const state = getEffectiveState(taxProfile)
    const stateCode = STATE_CODES[state]

    // Group employee under this state
    if (!stateGroups.has(stateCode)) {
      stateGroups.set(stateCode, [])
    }
    stateGroups.get(stateCode).push(/* employee data */)
  }

  return stateGroups
}
```

### Annual Form H1 Generation

Same logic applies for annual returns - employees are grouped by their **locked state** (or current state if not locked).

---

## Frontend Implementation

### Lock States Button

```tsx
function LockStatesButton({ year, companyId }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const handleLockStates = async () => {
    if (!confirm(`Lock all employee states for ${year}? This cannot be undone.`)) {
      return
    }

    setLoading(true)
    try {
      const response = await axios.post(
        '/api/engine/tax-filing/profiles/lock-states',
        { year, companyId }
      )
      setResult(response.data.data)
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to lock states')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleLockStates}
        disabled={loading}
        className="bg-yellow-600 text-white px-4 py-2 rounded"
      >
        {loading ? 'Locking...' : `Lock States for ${year}`}
      </button>

      {result && (
        <div className="mt-4 p-4 bg-gray-100 rounded">
          <p>Newly Locked: {result.locked}</p>
          <p>Already Locked: {result.alreadyLocked}</p>
          <p>Skipped: {result.skipped}</p>
        </div>
      )}
    </div>
  )
}
```

### Display Lock Status

```tsx
function TaxProfileCard({ profile }) {
  const isLocked = !!profile.lockedState

  return (
    <div className="border rounded p-4">
      <h3>{profile.staff.fullName}</h3>

      <div className="mt-2">
        <span className="text-gray-600">Current State: </span>
        <span>{profile.stateOfResidence}</span>
      </div>

      {isLocked && (
        <div className="mt-2">
          <span className="text-gray-600">Tax State (Locked): </span>
          <span className="font-bold text-blue-600">{profile.lockedState}</span>
          <span className="text-xs text-gray-500 ml-2">
            since {new Date(profile.lockedDate).toLocaleDateString()}
          </span>
        </div>
      )}

      {isLocked && profile.stateOfResidence !== profile.lockedState && (
        <div className="mt-2 text-sm text-yellow-600">
          Note: Employee relocated, but tax still filed to {profile.lockedState}
        </div>
      )}
    </div>
  )
}
```

---

## When to Lock States

### Recommended Workflow

```
DECEMBER (Before Year End)
├── Review employee tax profiles
├── Ensure all employees have stateOfResidence set
└── Verify any pending relocations

JANUARY 1ST (Start of New Year)
├── Call Lock States API: POST /profiles/lock-states { year: 2026 }
├── Verify lock results (all employees locked)
└── Document any skipped profiles

THROUGHOUT THE YEAR
├── New employees: Add tax profile (will be locked next Jan 1st)
├── Relocations: Update stateOfResidence (won't affect current year tax)
└── Monthly filing: System uses locked state automatically
```

### Automation Option

You can automate state locking via a cron job:

```javascript
// Run at 00:01 on January 1st
cron.schedule('1 0 1 1 *', async () => {
  const year = new Date().getFullYear()
  const companies = await getAllCompanies()

  for (const company of companies) {
    await lockStatesForYear(company.id, year)
  }

  console.log(`States locked for ${year}`)
})
```

---

## Important Notes

### 1. Lock is Permanent for the Year

Once locked, the `lockedState` cannot be changed until the next tax year. This is by design to comply with PITA.

### 2. New Employees

Employees hired after January 1st:
- Their `stateOfResidence` is used for the current year
- They will be locked on the next January 1st

### 3. Employees Without Tax Profiles

Employees without tax profiles cannot be included in:
- Monthly PAYE schedules
- Annual Form H1 returns

Always ensure all employees have tax profiles before January 1st.

### 4. Multiple Companies

Each company must lock states independently. The lock applies per company, not globally.

---

## Troubleshooting

### "Cannot change state of residence"

**Cause:** Attempting to update `stateOfResidence` after state is locked.

**Solution:**
- You CAN update `stateOfResidence` for tracking purposes
- The tax filing will still use `lockedState`
- Wait until next January 1st for the new state to take effect

### "States not appearing in filing"

**Cause:** Employees don't have tax profiles.

**Solution:**
1. Check: `GET /profiles?missingProfiles=true`
2. Create profiles for all employees
3. Lock states before filing

### "Wrong state in PAYE schedule"

**Cause:** State was locked before employee relocated.

**Solution:**
- This is correct behavior per PITA
- Employee's tax goes to locked state for entire year
- Document the relocation for audit purposes

---

## Summary

| Scenario | stateOfResidence | lockedState | Tax Filed To |
|----------|------------------|-------------|--------------|
| Before Jan 1st lock | Lagos | null | Lagos |
| After Jan 1st lock | Lagos | Lagos | Lagos |
| Relocated after lock | FCT | Lagos | Lagos |
| New employee (no lock yet) | Abuja | null | Abuja |
