# PHED Module — FE Integration Guide
## Rent Relief & Life Assurance Updates

**Backend version:** post `20260516`  
**Audience:** Frontend engineers  
**Scope:** PHED payroll module only

---

## 1. Summary of Changes

| Feature | What changed |
|---|---|
| **Rent Relief** | No longer driven by `annualRent`. Now a **flat ₦500,000** applied to every staff member automatically. No new fields, no FE input required for the calculation. |
| **Life Assurance** | New optional per-staff fields: `hasLifeAssurance` (boolean) and `lifeAssuranceAmount` (number). Deducted from annual gross before PAYE is calculated. |

---

## 2. Rent Relief

### What changed
Previously, rent relief was calculated as `20% of annualRent, capped at ₦500,000`. It is now a **fixed ₦500,000 for all staff**, regardless of whether they have an `annualRent` value.

### Impact on FE

**Annual Rent field** — the `annualRent` field still exists on staff records and can still be collected (it's stored for reference), but it no longer affects the PAYE calculation. Update any tooltip or helper text on that field to reflect this:

> ~~"Annual rent paid — used to compute rent relief (20%, capped at ₦500,000)"~~  
> ✅ **"Annual rent paid — stored for reference. NTA 2025 rent relief is a flat ₦500,000 for all staff."**

**Payslip / tax breakdown** — the `annualRentRelief` field in computed payrolls will always be `500000`. No layout change needed.

**No new form fields required.**

---

## 3. Life Assurance

### New staff fields

| Field | Type | Required | Description |
|---|---|---|---|
| `hasLifeAssurance` | `boolean` | No (defaults to `false`) | Whether this employee has a life assurance policy |
| `lifeAssuranceAmount` | `number \| null` | **Required when `hasLifeAssurance = true`** | Annual life assurance premium in naira. Deducted from annual gross income before PAYE is computed. |

### How it affects PAYE

```
Annual Chargeable Income =
  Annual Gross Income
  − Annual Pension Deduction
  − Rent Relief (₦500,000)
  − Life Assurance Amount   ← NEW
```

The `lifeAssuranceAmount` appears as a line item in the computed payroll record and on the payslip tax breakdown.

---

## 4. API Changes

### POST `/api/phed/staff` — Create staff (single onboarding)

Add the two new fields to the request body:

```json
{
  "companyId": "...",
  "staffId": "PHED-001",
  "firstName": "Ada",
  "lastName": "Obi",
  "email": "ada.obi@phed.com",
  "hasLifeAssurance": true,
  "lifeAssuranceAmount": 2400000,
  "..."
}
```

**Validation rule (enforced by backend):**
- If `hasLifeAssurance` is `true`, `lifeAssuranceAmount` must be present and greater than `0`. The API returns `400` if this is violated.
- If `hasLifeAssurance` is `false` or omitted, `lifeAssuranceAmount` is ignored.

---

### PUT `/api/phed/staff/:id` — Edit staff

Same fields are accepted on update:

```json
{
  "hasLifeAssurance": true,
  "lifeAssuranceAmount": 2400000
}
```

**Special case:** If you send `hasLifeAssurance: false`, the backend automatically clears `lifeAssuranceAmount` to `null`. You do not need to send both fields when disabling.

---

### GET `/api/phed/staff` and GET `/api/phed/staff/:id`

Both endpoints now return the new fields on every staff object:

```json
{
  "id": "...",
  "firstName": "Ada",
  "hasLifeAssurance": true,
  "lifeAssuranceAmount": "2400000.00",
  "..."
}
```

> Note: `lifeAssuranceAmount` is returned as a **string** (Prisma Decimal serialisation). Parse it with `parseFloat()` or `Number()` before displaying.

---

### Computed Payroll (payslip data)

The computed payroll record (returned by the payslip endpoints) now includes:

```json
{
  "annualRentRelief": "500000.00",
  "lifeAssuranceAmount": "2400000.00",
  "annualGrossIncome": "...",
  "annualPensionDeduction": "...",
  "annualChargeableIncome": "...",
  "annualPAYE": "...",
  "monthlyPAYE": "...",
  "..."
}
```

---

## 5. UI Implementation Guide

### Single Staff Onboarding Form

Add the following two fields (suggested placement: near the tax/salary section, after Annual Rent):

```
[ ] Has Life Assurance
    ↳ (shows when checked)
    Annual Life Assurance Amount (₦) [__________]
```

**Behaviour:**
- `hasLifeAssurance` — checkbox or toggle, default `false`
- `lifeAssuranceAmount` — number input, hidden when `hasLifeAssurance` is false, **required** and must be `> 0` when `hasLifeAssurance` is true
- Show inline validation: *"Life assurance amount is required when life assurance is enabled"*

---

### Edit Staff Form

Same fields, pre-populated from the staff record. When the toggle is turned off, clear the amount field and set it to empty/null before submitting.

---

### Bulk Upload — Excel Template

The downloadable staff template (`GET /api/phed/staff/template`) now includes two new columns at the end:

| Column | Header | Required | Valid values |
|---|---|---|---|
| V | Has Life Assurance | No | `YES` or `NO` (dropdown) |
| W | Life Assurance Amount | Conditional | Number > 0 (required if column V is `YES`) |

**Upload parsing rules:**
- `hasLifeAssurance`: `YES`, `TRUE`, or `1` → `true`; anything else → `false`
- `lifeAssuranceAmount`: numeric value in naira (e.g. `2400000`)
- If `hasLifeAssurance = YES` and `lifeAssuranceAmount` is missing or `0`, that row is rejected with an error message

Advise users to download a fresh copy of the template — old templates will not have these columns (existing uploads without them will default `hasLifeAssurance` to `false`).

---

### Payslip / Tax Breakdown Display

If you render the tax computation section, add **Life Assurance** as a deduction line between Rent Relief and Annual Chargeable Income:

```
Annual Gross Income          ₦ 6,000,000.00
− Rent Relief                ₦   500,000.00
− Annual Pension Deduction   ₦   576,000.00
− Life Assurance             ₦ 2,400,000.00   ← show only if > 0
────────────────────────────────────────────
  Annual Chargeable Income   ₦ 2,524,000.00
  Annual PAYE                ₦   ...
  Monthly PAYE               ₦   ...
```

Hide the Life Assurance row when `lifeAssuranceAmount` is `0` or `null`.

---

## 6. Field Reference — Quick Summary

### `phedStaff` object (GET responses)

```ts
{
  hasLifeAssurance:    boolean        // new
  lifeAssuranceAmount: string | null  // new — Decimal as string, parse before use
  annualRent:          string | null  // existing — no longer affects PAYE
}
```

### Request body (POST / PUT)

```ts
{
  hasLifeAssurance?:    boolean  // optional, default false
  lifeAssuranceAmount?: number   // required & > 0 when hasLifeAssurance is true
}
```

### Computed payroll / payslip snapshot

```ts
{
  annualRentRelief:    string  // always "500000.00"
  lifeAssuranceAmount: string  // new — annual premium used in PAYE calc
}
```

---

## 7. Error Responses to Handle

| HTTP | `message` | When it occurs |
|---|---|---|
| `400` | `lifeAssuranceAmount is required and must be greater than 0 when hasLifeAssurance is true` | POST or PUT with `hasLifeAssurance: true` but missing/zero amount |
| `400` | `lifeAssuranceAmount must be greater than 0 when hasLifeAssurance is YES` | Bulk upload row with `hasLifeAssurance = YES` but missing/zero amount |

---

*Generated by backend team — 2026-05-16*
