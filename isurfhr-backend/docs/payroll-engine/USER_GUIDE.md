# iSURFHR Payroll Engine - User Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Payroll Lifecycle](#payroll-lifecycle)
4. [Managing Pay Periods](#managing-pay-periods)
5. [Employee Salary Management](#employee-salary-management)
6. [Overtime Management](#overtime-management)
7. [Deductions Management](#deductions-management)
8. [Validation Process](#validation-process)
9. [Payroll Computation](#payroll-computation)
10. [Viewing Payslips](#viewing-payslips)
11. [Tax Information](#tax-information)
12. [Role Permissions](#role-permissions)
13. [Frequently Asked Questions](#frequently-asked-questions)

---

## Introduction

The iSURFHR Payroll Engine is a comprehensive payroll management system designed to streamline salary processing for Nigerian businesses. It handles:

- **Salary Structures**: Basic salary, allowances, and benefits
- **Overtime Calculations**: Flexible overtime rates and tracking
- **Deductions**: Loans, penalties, and custom deductions
- **Tax Computation**: Nigeria 2026 PAYE tax law compliant
- **Pension Contributions**: Employee and employer contributions
- **Validation Workflow**: Supervisor approval before payment
- **Payslip Generation**: Detailed breakdown for each employee

---

## Getting Started

### System Requirements

- Access to the iSURFHR portal with appropriate role permissions
- Valid login credentials provided by your HR administrator

### Logging In

1. Navigate to the iSURFHR portal
2. Enter your email and password
3. Select your company (if applicable)
4. You will be directed to your dashboard based on your role

---

## Payroll Lifecycle

Understanding the payroll lifecycle is essential for proper use of the system.

```
DRAFT --> VALIDATION_OPEN --> VALIDATION_CLOSED --> COMPUTING --> REVIEW --> APPROVED --> PAID
```

### Status Descriptions

| Status | Description | Actions Available |
|--------|-------------|-------------------|
| **DRAFT** | Initial state when a pay period is created | Add overtime, deductions, update salaries |
| **VALIDATION_OPEN** | Supervisors can validate staff for payment | Validate/withhold staff payments |
| **VALIDATION_CLOSED** | Validation window closed | No more validations accepted |
| **COMPUTING** | System is calculating payroll | View progress |
| **REVIEW** | Payroll computed, awaiting approval | Review calculations, approve payroll |
| **APPROVED** | Payroll approved for payment | Process bank payments |
| **PAID** | Payments completed | View payslips, generate reports |

---

## Managing Pay Periods

### Creating a Pay Period

*Required Role: SUPER_ADMIN, ADMIN*

1. Navigate to **Payroll > Pay Periods**
2. Click **Create New Period**
3. Fill in the details:
   - **Period Name**: e.g., "March 2026 Payroll"
   - **Start Date**: First day of the pay period
   - **End Date**: Last day of the pay period
   - **Payment Date**: Expected salary payment date
4. Click **Create**

### Viewing Pay Periods

1. Navigate to **Payroll > Pay Periods**
2. View the list of all pay periods with their current status
3. Click on a period to see detailed information

### Updating Pay Period Status

*Required Role: SUPER_ADMIN, ADMIN*

1. Open the pay period details
2. Click **Change Status**
3. Select the new status from the dropdown
4. Confirm the change

> **Note**: Status changes follow the lifecycle order. You cannot skip statuses.

---

## Employee Salary Management

### Adding a New Salary Structure

*Required Role: SUPER_ADMIN, ADMIN, HR*

1. Navigate to **Payroll > Employee Salaries**
2. Click **Add Salary Structure**
3. Select the employee
4. Enter salary details:
   - **Basic Salary**: Monthly base pay
   - **Housing Allowance**: Monthly housing benefit
   - **Transport Allowance**: Monthly transport benefit
   - **Other Allowances**: Additional allowances
   - **Effective Date**: When this salary starts
5. Click **Save**

### Updating an Existing Salary

1. Navigate to **Payroll > Employee Salaries**
2. Find the employee and click **Edit**
3. Update the relevant fields
4. Click **Save Changes**

### Bulk Import Salaries

*Required Role: SUPER_ADMIN, ADMIN*

For importing multiple salary structures:

1. Navigate to **Payroll > Employee Salaries**
2. Click **Bulk Import**
3. Download the template CSV file
4. Fill in the employee salary data
5. Upload the completed file
6. Review the preview and confirm

---

## Overtime Management

### Adding Overtime Entry

*Required Role: ADMIN, HR, MANAGER*

1. Navigate to **Payroll > Overtime**
2. Select the pay period
3. Click **Add Overtime**
4. Fill in details:
   - **Employee**: Select the staff member
   - **Hours**: Number of overtime hours
   - **Rate**: Overtime multiplier (e.g., 1.5 for time-and-a-half)
   - **Description**: Reason for overtime
5. Click **Submit**

### Overtime Rates

| Rate | Description | Example |
|------|-------------|---------|
| 1.0 | Regular rate | Training hours |
| 1.5 | Time and a half | Weekday overtime |
| 2.0 | Double time | Weekend overtime |
| 2.5 | Premium rate | Public holiday |

### Viewing Overtime by Period

1. Navigate to **Payroll > Overtime**
2. Select the pay period from the dropdown
3. View all overtime entries with totals

### Deleting an Overtime Entry

1. Find the overtime entry in the list
2. Click the **Delete** button
3. Confirm the deletion

> **Note**: Overtime cannot be deleted after payroll has been computed.

---

## Deductions Management

### Types of Deductions

| Type | Description | Examples |
|------|-------------|----------|
| **LOAN** | Salary advance or loan repayment | Staff loan, cooperative deduction |
| **PENALTY** | Disciplinary deduction | Late penalty, absence deduction |
| **OTHER** | Miscellaneous deductions | Union dues, equipment damage |

### Adding a Deduction

*Required Role: ADMIN, HR, MANAGER*

1. Navigate to **Payroll > Deductions**
2. Select the pay period
3. Click **Add Deduction**
4. Fill in details:
   - **Employee**: Select the staff member
   - **Type**: LOAN, PENALTY, or OTHER
   - **Amount**: Deduction amount in Naira
   - **Description**: Reason for deduction
5. Click **Submit**

### Viewing Deductions

1. Navigate to **Payroll > Deductions**
2. Select the pay period
3. View all deductions grouped by type

---

## Validation Process

The validation process ensures supervisors confirm their team members' eligibility for payment before payroll is processed.

### Opening the Validation Window

*Required Role: SUPER_ADMIN, ADMIN*

1. Navigate to the pay period
2. Change status to **VALIDATION_OPEN**
3. Supervisors will be notified to validate their teams

### Validating Staff (For Supervisors)

*Required Role: MANAGER (or higher)*

1. Navigate to **Payroll > Validations**
2. Select the active pay period
3. You will see your team members listed
4. For each staff member:
   - Click **Yes for Payment** to approve
   - Click **No for Payment** to withhold (requires a reason)
5. Your validations are saved automatically

### Validation Status Options

| Status | Meaning |
|--------|---------|
| **PENDING** | Not yet validated by supervisor |
| **YES_FOR_PAYMENT** | Approved for payment |
| **NO_FOR_PAYMENT** | Withheld from payment (with reason) |

### Bulk Validation

To validate multiple staff members at once:

1. Select the checkboxes next to staff names
2. Click **Bulk Validate**
3. Choose **Yes for Payment** or **No for Payment**
4. If withholding, enter a reason
5. Click **Submit**

### Viewing Validation Progress

*Required Role: ADMIN or higher*

1. Navigate to **Payroll > Validations > Summary**
2. View statistics:
   - Total staff to validate
   - Validated count
   - Pending count
   - Withheld count
   - Completion percentage

---

## Payroll Computation

### Computing Payroll

*Required Role: SUPER_ADMIN, ADMIN*

1. Ensure the validation window is closed
2. Navigate to **Payroll > Compute**
3. Select the pay period
4. Click **Compute Payroll**
5. Wait for the computation to complete

### What Gets Calculated

For each validated employee, the system calculates:

1. **Gross Salary**
   - Basic Salary
   - Housing Allowance
   - Transport Allowance
   - Other Allowances
   - Overtime Pay

2. **Statutory Deductions**
   - PAYE Tax (based on Nigeria 2026 tax law)
   - Pension Contribution (Employee: 8%, Employer: 10%)

3. **Other Deductions**
   - Loans
   - Penalties
   - Other

4. **Net Salary**
   - Gross - Tax - Pension - Other Deductions

### Approving Payroll

*Required Role: SUPER_ADMIN*

1. Review the computation summary
2. Check for any anomalies
3. Click **Approve Payroll**
4. The payroll status changes to APPROVED

### Marking Payroll as Paid

*Required Role: SUPER_ADMIN*

After bank transfers are complete:

1. Navigate to the approved pay period
2. Click **Mark as Paid**
3. Confirm the action
4. Payslips become available to employees

---

## Viewing Payslips

### For Employees

1. Navigate to **My Payslips**
2. View your payslip history
3. Click on a payslip to see details
4. Click **Download PDF** to save a copy

### For Administrators

1. Navigate to **Payroll > Payslips**
2. Select the pay period
3. View all payslips for the period
4. Search or filter by employee
5. Click on a payslip for details

### Payslip Information

Each payslip includes:

| Section | Details |
|---------|---------|
| **Employee Info** | Name, ID, Department, Position |
| **Pay Period** | Start date, End date, Payment date |
| **Earnings** | Basic, Allowances, Overtime |
| **Deductions** | Tax, Pension, Loans, Penalties |
| **Summary** | Gross Pay, Total Deductions, Net Pay |

---

## Tax Information

### Nigeria PAYE Tax (2026 Law)

The system automatically calculates PAYE tax based on the Nigeria 2026 tax law.

### Tax Reliefs

Before calculating tax, the following reliefs are applied:

| Relief | Amount |
|--------|--------|
| Rent Relief | 20% of gross income |
| Consolidated Relief Allowance (CRA) | Higher of: 1% of gross OR NGN 200,000 |
| Minimum Threshold | First NGN 800,000 is tax-free |

### Tax Bands

| Band | Annual Income Range | Tax Rate |
|------|---------------------|----------|
| 1 | NGN 0 - NGN 800,000 | 0% |
| 2 | NGN 800,001 - NGN 1,100,000 | 7% |
| 3 | NGN 1,100,001 - NGN 1,600,000 | 11% |
| 4 | NGN 1,600,001 - NGN 3,200,000 | 15% |
| 5 | NGN 3,200,001 - NGN 6,400,000 | 19% |
| 6 | Above NGN 6,400,000 | 24% |

### Viewing Tax Reports

*Required Role: ADMIN or higher*

1. Navigate to **Payroll > Tax Reports**
2. Select the pay period
3. View the breakdown by tax band
4. Export for filing with tax authorities

---

## Role Permissions

### Permission Matrix

| Feature | SUPER_ADMIN | ADMIN | HR | MANAGER | STAFF |
|---------|-------------|-------|-----|---------|-------|
| Create Pay Period | Yes | Yes | No | No | No |
| Update Period Status | Yes | Yes | No | No | No |
| Manage Salaries | Yes | Yes | Yes | No | No |
| Add Overtime | Yes | Yes | Yes | Yes | No |
| Add Deductions | Yes | Yes | Yes | Yes | No |
| Validate Staff | Yes | Yes | Yes | Yes | No |
| Compute Payroll | Yes | Yes | No | No | No |
| Approve Payroll | Yes | No | No | No | No |
| Mark as Paid | Yes | No | No | No | No |
| View All Payslips | Yes | Yes | Yes | Yes | No |
| View Own Payslips | Yes | Yes | Yes | Yes | Yes |
| Tax Reports | Yes | Yes | No | No | No |

---

## Frequently Asked Questions

### General

**Q: Can I edit a pay period after it's been created?**
A: You can only change the status. Core details (dates, name) cannot be modified after creation.

**Q: What happens if I forget to validate a staff member?**
A: Staff members with PENDING validation status will not be included in the payroll computation.

### Overtime

**Q: Can I add overtime after payroll is computed?**
A: No. Overtime must be added before computation. You would need to revert the status (if allowed) or add it to the next period.

**Q: Is there a limit to overtime hours?**
A: The system doesn't enforce a limit, but your company policy may have restrictions.

### Deductions

**Q: Can a deduction exceed an employee's net pay?**
A: The system will warn you, but it's possible. The employee would have a negative net pay which needs manual handling.

**Q: How do I set up recurring deductions?**
A: Currently, deductions must be added each pay period. Contact your administrator for bulk upload options.

### Validation

**Q: Can I change my validation after submitting?**
A: Yes, as long as the validation window is still open (status is VALIDATION_OPEN).

**Q: What happens to staff marked as NO_FOR_PAYMENT?**
A: They are excluded from payroll computation. Their withheld status and reason are recorded for audit purposes.

### Tax

**Q: How is tax calculated for new employees who join mid-year?**
A: Tax is calculated monthly based on projected annual income. The system assumes the salary will continue for the full year.

**Q: Where can I find my annual tax certificate?**
A: Navigate to **My Payslips > Annual Tax Summary** and select the year.

### Payslips

**Q: When can I view my payslip?**
A: Payslips become visible after the payroll status changes to PAID.

**Q: Can I dispute an error in my payslip?**
A: Contact your HR department immediately. Errors may be corrected in the following pay period as adjustments.

---

## Support

For technical support or questions not covered in this guide:

- **Email**: support@isurfhr.com
- **Phone**: +234-XXX-XXX-XXXX
- **Hours**: Monday - Friday, 9:00 AM - 5:00 PM WAT

---

*Document Version: 1.0*
*Last Updated: March 2026*
