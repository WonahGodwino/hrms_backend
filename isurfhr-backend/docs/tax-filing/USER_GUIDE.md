# Multi-State Tax Compliance & Filing - User Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Understanding Nigerian Tax Filing](#understanding-nigerian-tax-filing)
4. [Tax Profile Management](#tax-profile-management)
5. [Monthly PAYE Filing](#monthly-paye-filing)
6. [Annual Returns (Form H1)](#annual-returns-form-h1)
7. [Employee Tax Certificates](#employee-tax-certificates)
8. [Dashboard Overview](#dashboard-overview)
9. [Role Permissions](#role-permissions)
10. [Frequently Asked Questions](#frequently-asked-questions)
11. [Troubleshooting](#troubleshooting)

---

## Introduction

The Multi-State Tax Compliance & Filing module is a comprehensive solution for Nigerian businesses to manage PAYE tax compliance across all 36 states and the Federal Capital Territory (FCT). It integrates seamlessly with the iSURFHR Payroll Engine to automate:

- **State-by-State PAYE Filing** - Route employees to correct state IRS
- **Monthly Schedule Generation** - LIRS, OGIRS, and all state formats
- **Annual Form H1 Returns** - Employer's Annual Return of Income Tax
- **Employee Tax Certificates** - Individual tax deduction certificates
- **TIN Management** - JTB Tax Identification Number tracking

### Key Benefits

| Feature | Benefit |
|---------|---------|
| Multi-State Routing | Automatically groups employees by state of residence |
| Compliance Ready | Generates IRS-compliant schedules for all 37 jurisdictions |
| Excel/CSV Export | Download in your preferred format |
| January 1st Locking | Follows PITA guidelines for annual state locking |
| Audit Trail | Track who filed what and when |

---

## Getting Started

### Prerequisites

Before using the Tax Filing module, ensure:

1. ✅ Your company is set up in iSURFHR
2. ✅ Employees have been imported into Staff Records
3. ✅ Payroll has been processed (at least one pay period completed)
4. ✅ You have HR or Admin role access

### Quick Start Workflow

```
┌──────────────────────────────────────────────────────────────────┐
│                     QUICK START WORKFLOW                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Step 1: Set Up Tax Profiles                                      │
│  ─────────────────────────────                                    │
│  → Assign state of residence to each employee                    │
│  → Enter JTB TIN (if available)                                  │
│  → Use bulk import for large employee lists                      │
│                                                                   │
│  Step 2: Lock States (January 1st)                                │
│  ─────────────────────────────────                                │
│  → Lock employee states at start of tax year                     │
│  → This follows PITA guidelines                                  │
│                                                                   │
│  Step 3: Run Monthly Payroll                                      │
│  ───────────────────────────                                      │
│  → Complete payroll in the Payroll Engine                        │
│  → PAYE is calculated automatically                               │
│                                                                   │
│  Step 4: Generate & File PAYE Schedules                           │
│  ──────────────────────────────────────                           │
│  → Generate state schedules                                       │
│  → Download and submit to state IRS                              │
│  → Mark as filed with payment reference                          │
│                                                                   │
│  Step 5: Year-End Form H1                                         │
│  ────────────────────────                                         │
│  → Generate annual returns                                        │
│  → Download and file with state IRS                              │
│  → Generate employee tax certificates                            │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Understanding Nigerian Tax Filing

### What is PAYE?

Pay As You Earn (PAYE) is a method of collecting income tax from employees. Under this system, employers:

1. Calculate monthly tax based on annual income
2. Deduct tax from employee salaries
3. Remit to the relevant State Internal Revenue Service (IRS)
4. File returns with the state IRS

### Which State Receives the Tax?

Per the Personal Income Tax Act (PITA), tax is paid to the state where the employee **resides**, not where they work.

**Example:**
- Employee lives in Lagos but works in Ogun State
- PAYE is remitted to **LIRS (Lagos)**

### The January 1st Rule

The employee's state of residence is "locked" on January 1st of each year. If an employee moves mid-year, their tax still goes to the original state until the next January 1st.

### State Internal Revenue Services

Each of Nigeria's 36 states plus FCT has its own Internal Revenue Service:

| State | IRS Code | Full Name |
|-------|----------|-----------|
| Lagos | LIRS | Lagos Inland Revenue Service |
| Rivers | RIRS | Rivers State Internal Revenue Service |
| FCT | FCT-IRS | Federal Capital Territory Internal Revenue Service |
| Ogun | OGIRS | Ogun State Internal Revenue Service |
| *Others* | *StateCode*IRS | *State* Internal Revenue Service |

---

## Tax Profile Management

Tax profiles link employees to their state of residence for tax routing.

### Creating Individual Tax Profiles

**Required Role:** HR, Admin, Super Admin

1. Navigate to **Tax Filing > Tax Profiles**
2. Click **Add Tax Profile**
3. Select the employee from the dropdown
4. Fill in the details:

| Field | Required | Description |
|-------|----------|-------------|
| State of Residence | Yes | Nigerian state where employee lives |
| JTB TIN | No | 13-digit Tax Identification Number |
| PFA Name | No | Pension Fund Administrator name |

5. Click **Save Profile**

### Bulk Importing Tax Profiles

For companies with many employees, use bulk import:

1. Navigate to **Tax Filing > Tax Profiles**
2. Click **Import Profiles**
3. Download the template using **Download Template**
4. Fill in the Excel template:

| staffId | stateOfResidence | jtbTin | pfaName |
|---------|------------------|--------|---------|
| EMP001 | Lagos | 1234567890123 | ARM Pension |
| EMP002 | FCT | 9876543210123 | Stanbic IBTC |
| EMP003 | Ogun | | Leadway Pensure |

5. Upload the completed file
6. Review the import results

### Handling Import Errors

If some rows fail during import:

1. Download the **Failed Records** file
2. Review the error messages
3. Correct the data
4. Re-upload only the corrected rows

**Common Import Errors:**

| Error | Solution |
|-------|----------|
| "Employee not found" | Verify the staffId matches Staff Records |
| "Invalid state name" | Use exact state name (e.g., "Akwa Ibom" not "A/Ibom") |
| "Invalid TIN format" | TIN must be exactly 13 digits |
| "Profile already exists" | Employee already has a tax profile |

### Viewing Employees Without Profiles

To see which employees need tax profiles:

1. Navigate to **Tax Filing > Tax Profiles**
2. Click **Missing Profiles** tab
3. View the list of employees without profiles
4. Add profiles individually or export and bulk import

### Locking States (January 1st)

At the start of each tax year, lock employee states:

**Required Role:** HR, Admin, Super Admin

1. Navigate to **Tax Filing > Tax Profiles**
2. Click **Lock States for Year**
3. Select the year (e.g., 2026)
4. Confirm the action

**What happens:**
- Each employee's current state is copied to `lockedState`
- The lock date is recorded
- All filings for the year use the locked state

**Note:** You can only lock states once per year. Once locked, it cannot be undone.

---

## Monthly PAYE Filing

After payroll is processed, generate and file state schedules.

### Prerequisites

Before generating monthly schedules:

1. ✅ Pay period is in **REVIEW**, **APPROVED**, or **PAID** status
2. ✅ All employees have tax profiles (or you accept some will be excluded)
3. ✅ Payroll has been computed

### Viewing Monthly Filing Summary

1. Navigate to **Tax Filing > Monthly Filing**
2. Select the pay period (e.g., "March 2026")
3. View the summary:

| Metric | Description |
|--------|-------------|
| Total States | Number of states with employees |
| Total Employees | Employees included in filing |
| Total Tax | Total PAYE to be remitted |
| Missing Employees | Employees excluded (no tax profile) |

### Generating Monthly Schedules

1. From the Monthly Filing page, click **Generate Schedules**
2. Wait for processing to complete
3. View generated schedules by state

Each state schedule includes:
- List of employees in that state
- Gross income per employee
- Reliefs (CRA, Rent, Pension)
- Tax payable per employee
- State totals

### Downloading State Schedules

1. Find the state in the schedule list
2. Click the **Download** button
3. Choose format:
   - **Excel (.xlsx)** - Recommended for submission
   - **CSV (.csv)** - For data processing

The downloaded file contains:
- Company information header
- Employee breakdown table
- Summary totals
- Generation timestamp

### Filing with State IRS

After downloading:

1. Review the schedule for accuracy
2. Submit to the relevant state IRS portal or office
3. Make payment as required
4. Keep the payment reference/receipt

### Marking Schedules as Filed

After successful filing:

1. Navigate to the state schedule
2. Click **Mark as Filed**
3. Enter the payment reference (optional but recommended)
4. Confirm

The status changes from **GENERATED** to **FILED**.

---

## Annual Returns (Form H1)

At the end of each tax year, generate Form H1 for all states.

### What is Form H1?

Form H1 is the "Employer's Annual Return" required by Nigerian tax law. It summarizes:

- Total employees by state
- Annual gross income per employee
- Monthly tax breakdown (Jan-Dec)
- Annual tax totals

### Prerequisites

Before generating annual returns:

1. ✅ Complete 12 months of payroll for the year
2. ✅ All monthly schedules generated (recommended)
3. ✅ Year is complete (or at least current month is processed)

### Viewing Annual Filing Summary

1. Navigate to **Tax Filing > Annual Returns**
2. Select the tax year
3. View:
   - Available pay periods
   - Generated returns by state
   - Year totals

### Generating Form H1 Returns

1. Click **Generate Annual Returns**
2. Wait for processing
3. View generated returns by state

### Downloading Form H1

1. Find the state in the returns list
2. Click **Download Form H1**
3. Choose format:
   - **Excel (.xlsx)** - Full featured with formatting
   - **CSV (.csv)** - Data only

**Form H1 Contents:**

| Section | Contents |
|---------|----------|
| Header | Company name, Tax ID, Address, Year, State IRS |
| Employee Table | S/N, Name, TIN, Staff ID, Monthly tax (Jan-Dec), Annual totals |
| Summary | Total employees, Total gross income, Total tax deducted |

### Filing Form H1

After downloading:

1. Review for completeness
2. Submit to state IRS by January 31st of the following year
3. Mark as filed in the system

---

## Employee Tax Certificates

Generate tax certificates for employees who need them.

### What is a Tax Certificate?

A tax certificate is an official document showing:
- Employee and employer information
- Annual gross income
- Total PAYE deducted
- Monthly breakdown

Employees need these for:
- Personal tax filing
- Loan applications
- Visa applications
- Change of employer

### Generating Tax Certificates

**Option 1: Individual Certificate**

1. Navigate to **Tax Filing > Tax Certificates**
2. Select the year
3. Search for the employee
4. Click **Generate Certificate**
5. Download the Excel file

**Option 2: From Annual Returns**

1. Navigate to **Tax Filing > Annual Returns**
2. Select the year
3. Click **Tax Certificates** tab
4. View list of eligible employees
5. Download individual certificates

### Certificate Contents

| Section | Information |
|---------|-------------|
| Employee Info | Name, Staff ID, TIN, State, Email |
| Employer Info | Company Name, Tax ID, Address |
| Annual Summary | Gross Income, PAYE, Pension |
| Monthly Breakdown | Gross, Pension, PAYE, Net for each month |

---

## Dashboard Overview

The Tax Filing Dashboard provides a quick overview of your tax compliance status.

### Accessing the Dashboard

1. Navigate to **Tax Filing > Dashboard**
2. View the overview panels

### Dashboard Sections

#### Current Period Filing

| Metric | Description |
|--------|-------------|
| Period | Current pay period name |
| States | Number of states with employees |
| Generated | Schedules generated |
| Filed | Schedules marked as filed |
| Pending | Schedules awaiting filing |
| Total Tax | Total PAYE for the period |

#### Annual Summary

| Metric | Description |
|--------|-------------|
| Year | Current tax year |
| Total Employees | Employees with payslips this year |
| YTD Tax | Year-to-date PAYE collected |
| States | States with annual returns |

#### Tax Profile Status

| Metric | Description |
|--------|-------------|
| Total Profiles | Employees with tax profiles |
| With TIN | Profiles with JTB TIN entered |
| Without TIN | Profiles missing TIN |
| States Locked | Whether January locking is done |

#### Recent Activity

Shows recent filing activities:
- Schedule generated
- Schedule filed
- Annual return generated
- States locked

---

## Role Permissions

### Permission Matrix

| Action | STAFF | HR | ADMIN | SUPER_ADMIN |
|--------|-------|------|-------|-------------|
| View own tax profile | ✅ | ✅ | ✅ | ✅ |
| View all tax profiles | ❌ | ✅ | ✅ | ✅ |
| Create/edit tax profiles | ❌ | ✅ | ✅ | ✅ |
| Bulk import profiles | ❌ | ✅ | ✅ | ✅ |
| Lock states | ❌ | ✅ | ✅ | ✅ |
| View monthly filing | ❌ | ✅ | ✅ | ✅ |
| Generate schedules | ❌ | ✅ | ✅ | ✅ |
| Download schedules | ❌ | ✅ | ✅ | ✅ |
| Mark as filed | ❌ | ✅ | ✅ | ✅ |
| View annual returns | ❌ | ✅ | ✅ | ✅ |
| Generate Form H1 | ❌ | ✅ | ✅ | ✅ |
| Download Form H1 | ❌ | ✅ | ✅ | ✅ |
| View tax certificates | ❌ | ✅ | ✅ | ✅ |
| Generate certificates | ❌ | ✅ | ✅ | ✅ |
| View dashboard | ❌ | ✅ | ✅ | ✅ |

### Notes on Roles

- **STAFF**: Can only view their own tax profile
- **HR**: Full access to their company's tax filing
- **ADMIN**: Full access, must specify company ID
- **SUPER_ADMIN**: Full access to all companies, must specify company ID

---

## Frequently Asked Questions

### General Questions

**Q: Do I need to set up tax profiles before running payroll?**

A: No, you can run payroll without tax profiles. However, employees without profiles will be excluded from state filings. PAYE will still be calculated but won't be routed to a specific state.

**Q: Can I change an employee's state after locking?**

A: You can update the profile, but the `lockedState` remains unchanged for the year. The new state will apply from the next January 1st lock.

**Q: What happens if an employee has no TIN?**

A: You can still file. The TIN field will be empty in the schedule. However, some state IRSs may require TINs.

### Monthly Filing

**Q: When should I generate monthly schedules?**

A: After payroll is approved or paid. The pay period must be in REVIEW, APPROVED, or PAID status.

**Q: Can I regenerate schedules?**

A: Yes, generating schedules again will update the existing records with the latest data.

**Q: What if an employee is missing from a state schedule?**

A: Check if they have a tax profile with the correct state. If not, add the profile and regenerate.

### Annual Returns

**Q: Can I generate Form H1 before year-end?**

A: Yes, but it will only include months processed so far. Generate again after all 12 months are complete.

**Q: The Form H1 shows fewer months than expected. Why?**

A: Only pay periods in REVIEW, APPROVED, or PAID status are included. Check if any periods are still in DRAFT.

### Tax Certificates

**Q: Can employees download their own certificates?**

A: Not currently in self-service. HR or Admin must generate and provide certificates.

**Q: What if an employee worked only part of the year?**

A: The certificate will show only the months they have payslips for.

---

## Troubleshooting

### Common Issues

#### "No employees found for state X"

**Cause:** No employees have tax profiles with that state.

**Solution:**
1. Check if employees have tax profiles
2. Verify the state name is correct
3. Generate missing profiles

#### "Pay period not found"

**Cause:** The period doesn't exist or belongs to another company.

**Solution:**
1. Verify the period ID
2. Check you're accessing the correct company

#### "Invalid state name"

**Cause:** State name doesn't match the system's list.

**Solution:** Use exact state names:
- ✅ "Akwa Ibom" (not "A/Ibom" or "Akwa-Ibom")
- ✅ "FCT" (not "Abuja" or "Federal Capital Territory")
- ✅ "Cross River" (not "Cross-River" or "CrossRiver")

#### "Cannot generate schedules for period in DRAFT status"

**Cause:** Payroll hasn't been computed yet.

**Solution:**
1. Go to Payroll Engine
2. Advance the period to at least REVIEW status
3. Try generating schedules again

#### "Profile already exists"

**Cause:** Employee already has a tax profile.

**Solution:**
- To update: Use the edit function instead of create
- For bulk import: Remove duplicate rows

### Getting Help

If you encounter issues not covered here:

1. Contact your system administrator
2. Check the API Documentation for technical details
3. Report bugs at the iSURFHR support portal

---

## Appendix: Nigeria States List

### All 36 States + FCT by Geopolitical Zone

#### North Central
- Benue
- FCT (Federal Capital Territory)
- Kogi
- Kwara
- Nasarawa
- Niger
- Plateau

#### North East
- Adamawa
- Bauchi
- Borno
- Gombe
- Taraba
- Yobe

#### North West
- Jigawa
- Kaduna
- Kano
- Katsina
- Kebbi
- Sokoto
- Zamfara

#### South East
- Abia
- Anambra
- Ebonyi
- Enugu
- Imo

#### South South
- Akwa Ibom
- Bayelsa
- Cross River
- Delta
- Edo
- Rivers

#### South West
- Ekiti
- Lagos
- Ogun
- Ondo
- Osun
- Oyo

---

## Document Information

**Version:** 1.0.0
**Last Updated:** March 2026
**Author:** iSURFHR Development Team

For technical integration details, see the [API Documentation](./API_DOCUMENTATION.md).
