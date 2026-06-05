# PHED Payroll System
## User Guide & Training Manual

**For:** Port Harcourt Electricity Distribution Company HR Team  
**Platform:** 24/7HR  
**Version:** 1.1

---

## Welcome

This guide walks you through everything you need to use the PHED Payroll System on the 24/7HR platform — from first-time setup to running payroll every month and downloading reports. Read it once from beginning to end before you start; after that, use it as a reference whenever you need a refresher on a specific task.

---

## Table of Contents

1. Understanding the System
2. Logging In & First-Time Setup
3. One-Time System Configuration
4. Onboarding Staff
5. Running Monthly Payroll — Step by Step
6. Downloading Reports
7. Employee Self-Service (Staff Payslips)
8. Managing Staff Records
9. Frequently Asked Questions
10. Glossary

---

## Chapter 1: Understanding the System

### What the system does

The PHED Payroll System automates the entire monthly salary process for PHED employees. Once you have set it up, here is what happens every payroll cycle:

1. You create a "pay period" for the month (e.g. April 2026)
2. Supervisors/HR confirm which staff should be paid that month
3. HR enters any overtime worked
4. The system automatically calculates each employee's gross salary, tax (PAYE under the Nigeria Tax Act 2025), pension contributions, NHF, union dues, cooperative deductions, and net salary
5. An authorised manager reviews and approves the figures
6. Staff receive their payslips by email
7. You download bank payment files, tax schedules, and other statutory reports

### Key concepts to understand

**Grade** — A salary level (e.g. GL09, GL06, GM). Each grade has a basic salary and a breakdown of allowances. When you assign a staff member to a grade, their salary is automatically structured according to that grade's template unless you set a personal override.

**Allowance templates** — The percentage or fixed naira amounts that make up the full salary package for a grade. For example, a grade might say "Housing = 40% of basic, Transport = 15% of basic, Meal Subsidy = ₦15,000 fixed."

**Pay period** — A calendar month of payroll. April 2026 and May 2026 are separate pay periods. Each one goes through a fixed set of stages before it is finalised.

**Validation** — Before payroll is computed, HR must confirm which staff should be paid that month. This step is called validation. Staff approved for payment are marked YES. Staff who should not be paid (e.g. absent without leave, suspended) are marked NO, and their salary is withheld.

**Withheld salary** — A staff member whose validation status is NO will still have their salary computed so you can see what it would have been, but it is flagged as WITHHELD and does not appear on the bank payment schedule.

**PAYE** — Pay As You Earn income tax, calculated automatically using the Nigeria Tax Act 2025 progressive bands.

**Pension** — Employee contributes 8% and the employer contributes 10% of the pensionable salary (basic + housing allowance + transport allowance).

**NHF** — National Housing Fund: 2.5% of basic salary, employee-borne.

**Union** — A fixed monthly naira deduction (e.g. ₦2,000 per month) for union membership.

**Cooperative** — A percentage deduction from gross salary (e.g. 5% of gross) for cooperative society membership. A staff member can belong to more than one cooperative.

---

## Chapter 2: Logging In & First-Time Setup

### Logging in

1. Open your browser and go to the 24/7HR platform login page
2. Enter your email address and password
3. Click **Log In**

### If you are logging in for the first time (staff accounts)

When your HR administrator creates your account, you will receive a welcome email with a temporary password. When you log in with that temporary password, the system will immediately ask you to set a new password. You cannot skip this step.

- Your new password must be at least 8 characters long
- Choose something you will remember but that others cannot guess
- You will not need to change your password again unless you choose to

---

## Chapter 3: One-Time System Configuration

Before you can run any payroll, you must set up the foundational data for PHED. You only do this once (and update it whenever things change).

Work through this checklist in order — each item depends on the one before it.

### 3.1 Create Grades

Grades define how salaries are structured. Every staff member must belong to a grade (unless you manually override their salary).

**To create a grade:**
1. Go to **Configuration → Grades**
2. Click **New Grade**
3. Fill in:
   - **Name** — a human-readable label, e.g. "Grade Level 9"
   - **Code** — a short unique identifier, e.g. GL09 (this is what the upload template uses)
   - **Category** — REGULAR or CONTRACT
   - **Level Order** — a number that determines where this grade sits in the hierarchy (1 is lowest)
   - **Default Basic Salary** — the monthly basic salary for this grade in naira
4. Click **Save**

**Setting allowances for a grade:**

After creating the grade, click on it and open the **Allowances** tab. Here you add the breakdown of the full salary:

| Allowance | Type | What to enter |
|---|---|---|
| Housing | PERCENTAGE | e.g. 40 (means 40% of basic salary) |
| Transport | PERCENTAGE | e.g. 15 |
| Furniture | PERCENTAGE | e.g. 10 |
| Meal Subsidy | FIXED | e.g. 15000 (naira per month) |
| Utility | FIXED | e.g. 10000 |
| Leave | PERCENTAGE | e.g. 10 |
| Shift | FIXED | e.g. 5000 |

You do not need to fill in every allowance — only the ones that apply to this grade. Leave the rest blank.

Click **Save Allowances** when done.

> **Example:** For GL09 with a basic salary of ₦250,000:
> - Housing (40%) = ₦100,000
> - Transport (15%) = ₦37,500
> - Furniture (10%) = ₦25,000
> - Meal Subsidy (fixed ₦15,000) = ₦15,000
> - **Gross before overtime** = ₦427,500

Repeat this for every grade in the organisation.

### 3.2 Create Regions

Regions are the geographical zones PHED operates in (e.g. Port Harcourt Zone, Rumuola Zone).

1. Go to **Configuration → Regions**
2. Click **New Region**, enter the name, click **Save**

### 3.3 Create Feeders

Feeders belong to regions. Create all feeders and link them to their region.

1. Go to **Configuration → Feeders**
2. Click **New Feeder**, enter the name and select the parent region, click **Save**

### 3.4 Create Pay Points

Pay points are locations where salaries are disbursed from (e.g. Head Office, Rumuola District).

1. Go to **Configuration → Pay Points**
2. Click **New Pay Point**, enter the name, click **Save**

### 3.5 Create Unions

A union is a fixed monthly deduction. If PHED has a workers' union with a fixed monthly due, create it here.

1. Go to **Configuration → Unions**
2. Click **New Union**
3. Enter the name (e.g. "NUEE") and the **Monthly Amount** in naira (e.g. ₦2,000)
4. Click **Save**

> You can create multiple unions if different groups of staff belong to different unions.

#### Adding Union Members in Bulk (Chairman Upload)

When a union chairman presents a list of new members, use the bulk upload feature instead of assigning them one by one.

**Step 1: Download the member template for that union**
1. Go to **Configuration → Unions**
2. Click on the union name
3. Click **Download Member Template**
4. A ready-to-fill Excel file downloads — it has two sheets:
   - **"New Members"** — the chairman fills in one Staff ID per row
   - **"Staff Directory (Reference)"** — a full read-only list of all staff with their IDs, for the chairman to look up correct IDs

**Step 2: Give the template to the union chairman**

Hand (or email) the template to the chairman. Ask them to fill in the Staff ID for each new member in the "New Members" sheet. They should use the "Staff Directory (Reference)" sheet to look up the correct Staff ID for each person.

**Step 3: Upload the completed file**
1. Return to **Configuration → Unions → [Union Name]**
2. Click **Upload Members**
3. Choose the completed Excel file and click **Upload**

The system will report:
- **Added** — staff successfully added to the union
- **Skipped** — staff IDs that were already members (no change, no error)
- **Failed** — rows where the Staff ID could not be found (check the "Staff Directory" sheet for the correct ID and re-upload those rows)

> **Safe to re-upload:** If the chairman submits a file that includes some existing members by mistake, those rows are simply skipped. No duplicate deductions are created.

### 3.6 Create Cooperatives

A cooperative uses a percentage of gross salary instead of a fixed amount.

1. Go to **Configuration → Cooperatives**
2. Click **New Cooperative**
3. Enter the name (e.g. "PHED Staff Cooperative Society") and the **Deduction Percentage** (e.g. 5 for 5% of gross salary)
4. Click **Save**

#### Adding Cooperative Members in Bulk (Chairman Upload)

The same chairman-upload workflow applies to cooperatives.

**Step 1: Download the member template**
1. Go to **Configuration → Cooperatives**
2. Click on the cooperative name
3. Click **Download Member Template**
4. The Excel file downloads with the same two-sheet structure as the union template

**Step 2: Give the template to the cooperative chairman**

The chairman fills in Staff IDs for each new member using the "Staff Directory (Reference)" sheet to look up IDs.

**Step 3: Upload the completed file**
1. Return to **Configuration → Cooperatives → [Cooperative Name]**
2. Click **Upload Members**
3. Choose the completed file and click **Upload**

The same **Added / Skipped / Failed** summary is shown. Re-uploading the same file is always safe — existing members are skipped automatically.

---

## Chapter 4: Onboarding Staff

Once configuration is complete, you can add staff members. There are two ways to do this.

### Option A: Add staff one at a time

Use this for adding a single new employee.

1. Go to **Staff → Add Staff**
2. Fill in all the required fields:
   - First Name, Last Name, Staff ID, Email
   - Category (REGULAR or CONTRACT)
   - Grade (select from the grades you created)
   - Department, Unit, Region, Feeder, Pay Point
   - Bank Name, Account Number, Account Name
   - RSA PIN, PFA Name (for pension)
   - Annual Rent (if applicable — used for NTA 2025 rent relief tax calculation)
3. Click **Save**

As soon as you save, the system automatically:
- Creates a login account for the staff member on the 24/7HR platform
- Sets their temporary password to their **first name + last name in lowercase** (e.g. John Doe → `johndoe`)
- Sends them a welcome email with their login credentials and a link to the platform
- Marks their account to require a password change on first login

### Option B: Bulk upload from Excel (recommended for large teams)

Use this to add many staff members at once.

**Step 1: Download the template**
1. Go to **Staff → Upload Staff**
2. Click **Download Template**
3. Open the downloaded file in Excel or Google Sheets

**Step 2: Fill in the template**

The template has 19 columns. The ones marked with * are required:

| Column | Required? | Notes |
|---|---|---|
| First Name | Yes | |
| Last Name | Yes | |
| Staff ID | Yes | Must be unique — e.g. PHED-001 |
| Email | Yes | Work email, will be used as login |
| Phone | No | |
| Category | Yes | Type REGULAR or CONTRACT (dropdown provided) |
| Grade Code | No | Must match a code you created e.g. GL09 |
| Department | No | |
| Unit | No | |
| Region | No | Must match a region name exactly as created |
| Feeder | No | Must match a feeder name exactly as created |
| Pay Point | No | Must match a pay point name exactly |
| Bank Name | No | |
| Account Number | No | 10-digit NUBAN |
| Account Name | No | |
| RSA PIN | No | Pension account PIN |
| PFA Name | No | Pension Fund Administrator |
| Basic Salary | No | Override the grade default if different |
| Annual Rent | No | Used for rent relief tax calculation |

> **Important:** Delete the yellow sample row (Row 3) before uploading your real data.

**Step 3: Upload the file**
1. Go to **Staff → Upload Staff**
2. Click **Choose File** and select your completed template
3. Click **Upload**

The system processes each row and reports how many succeeded and how many failed (with reasons for failures). If there are failures, download the error report, fix those rows, and re-upload just the failed ones.

> **Re-uploading:** If you upload a staff member who already exists (same Staff ID), their record is updated — no duplicate is created. Welcome emails are only sent to **newly created** staff, not to existing staff being updated.

### Assigning Unions and Cooperatives to Staff

A union or cooperative deduction only appears on a staff member's payslip if they have been assigned as a member **before payroll is computed** for that month. This is the most important rule to understand:

> **Rule:** Assign memberships before you click "Compute Payroll". If you assign someone after compute has already run, their deduction will not appear in that run — you must recompute to include it.

There are two ways to make the assignment.

---

#### Method 1: Individually (one staff member at a time)

Use this when a single staff member joins a union or cooperative, or when correcting a missing assignment.

1. Go to **Staff**
2. Search for and open the staff member's record
3. Click the **Memberships** tab
4. Under **Unions**, click **Add Union** and select the union from the dropdown
5. Click **Save**
6. Repeat under **Cooperatives** if the staff member also joins a cooperative

The system checks the following before saving:
- The union/cooperative must be **active** (deactivated ones cannot be assigned)
- The staff member cannot be added to the same union or cooperative twice (a duplicate will be rejected with a clear error message)

Once saved, the deduction will be included the next time payroll is computed for any open pay period.

---

#### Method 2: In bulk (chairman upload — recommended for multiple members)

Use this when a union or cooperative chairman submits a list of new members. This is the faster path when adding 10 or more people at once.

Follow the Chairman Upload steps in **Section 3.5** (for unions) or **Section 3.6** (for cooperatives).

---

#### When exactly should assignments be made?

The table below shows where union/cooperative assignments fit in the monthly payroll timeline and what to do if you missed the window:

| You assign the membership at this point | What happens |
|---|---|
| During onboarding (before first payroll) | Deduction applies from the very first payroll run for this staff member |
| After creating a pay period (DRAFT status) — before opening validation | Deduction included when payroll is computed |
| During the validation phase (VALIDATION OPEN or VALIDATION CLOSED) | Deduction included when payroll is computed |
| After compute has already run (period is in REVIEW) | Deduction **not** in the current results. Assign the membership, then click **Compute Payroll** again — the system recalculates and picks up the new membership |
| After payroll is approved or paid | Too late for that pay period. The membership is saved and will apply from the **next** month's payroll |

> **In practice:** The safest time is during the validation phase (Steps 2–5 of the monthly process). By then you have already confirmed which staff are active and you have not yet computed. If you discover a missing membership after compute, fix it immediately and recompute — the guide allows unlimited recomputations before approval.

---

#### Removing a staff member from a union or cooperative

If a staff member resigns from a union or cooperative:

1. Open their staff record and go to the **Memberships** tab
2. Click **Remove** next to the union or cooperative
3. Click **Confirm**

The same timing rule applies: remove the membership before compute runs if you want the deduction excluded from the current month. If compute has already run, remove and recompute.

---

## Chapter 5: Running Monthly Payroll — Step by Step

This is the process you repeat every month. Follow the steps in order.

### Step 1: Create the Pay Period

1. Go to **Payroll → Pay Periods**
2. Click **New Pay Period**
3. Select the **Year** and **Month**
4. Click **Create**

The period is created with the status **DRAFT**.

### Step 2: Open Validation

Validation is the process of confirming which staff should be paid this month.

1. Click on the pay period you just created
2. Click **Open Validation**

The system automatically creates a validation record for every active staff member and changes the period status to **VALIDATION OPEN**.

### Step 3: Submit the Validation File

**Download the validation template:**
1. Click **Download Validation Template**
2. Open the file — it is pre-filled with all staff names, staff IDs, departments, and their current status

**Fill in the template:**
- The **Status** column has a dropdown — select either **YES** or **NO** for each staff member
- **YES** = staff should be paid this month
- **NO** = salary should be withheld this month
- If you select NO, you must fill in the **Reason** column (e.g. "Absent without leave – full month", "Under suspension")
- Staff you are unsure about can remain as PENDING, but all staff must eventually have YES or NO before you can close validation

**Upload the completed file:**
1. Go back to the pay period
2. Click **Upload Validations**
3. Choose your completed file and click **Upload**

> **Tip:** You can upload the validation file multiple times. Each upload updates the statuses for the rows included. You do not have to do it all in one go.

### Step 4: Upload Overtime (if applicable)

If any staff worked overtime this month:

1. Click **Download Overtime Template**
2. Open the pre-filled file — it lists all active staff with an Overtime Hours column set to 0
3. Enter the number of overtime hours for each staff member who worked overtime (decimals are allowed, e.g. 8.5 hours)
4. Leave staff who worked no overtime as 0 (or just leave their rows blank)
5. Upload the completed file

> The overtime formula is: **(Monthly Gross ÷ 160) × 1.5 × Overtime Hours**
> This means overtime is paid at 1.5× the hourly rate, where the hourly rate is based on 160 working hours per month.

### Step 5: Close Validation

Once you are satisfied that all validations are complete:

1. Go to the pay period
2. Click **Close Validation**

The period status changes to **VALIDATION CLOSED**. You can still upload overtime after this point, but you can no longer change validation statuses.

### Step 6: Compute Payroll

1. Click **Compute Payroll**

The system now runs the full salary calculation for every active staff member. This takes a few seconds.

**What is calculated for each staff member:**
- Basic salary (from grade default, or personal override if set)
- All allowances (from grade template, or personal overrides)
- Overtime earnings (if overtime was uploaded)
- Gross salary
- Pension: employee pays 8%, employer pays 10% (on basic + housing + transport)
- NHF: 2.5% of basic salary
- PAYE tax: computed using NTA 2025 progressive bands after deducting pension and rent relief
- Union dues (fixed amounts per union membership)
- Cooperative deductions (percentages of gross per cooperative membership)
- Net salary = Gross − all deductions

The period status changes to **REVIEW**.

> **Recomputing:** If you discover an error (e.g. someone's grade was wrong), correct the staff record, then click **Compute Payroll** again. This replaces the previous results with fresh calculations.

### Step 7: Review the Summary

Go to **Summary** on the pay period to see:
- Total head count, active count, withheld count
- Total gross, total net, total overtime
- Total PAYE, pension, NHF
- ITF and NSITF liability
- Breakdown of union and cooperative deductions
- Validation status counts (how many YES, NO, PENDING)

Check these numbers. If something looks wrong, go back and fix it (update the staff record, adjust validations or overtime, then recompute).

### Step 8: Approve Payroll

Once you are satisfied the figures are correct, an **ADMIN** or **SUPER_ADMIN** must approve the payroll:

1. Click **Approve Payroll**

The period status changes to **APPROVED**. Reports can now be downloaded and payslips sent.

> **Note:** HR, ADMIN, and SUPER_ADMIN users can all approve payroll.

### Step 9: Send Payslip Emails

1. Click **Send Payslip Emails**

The system sends an HTML payslip email to every staff member marked ACTIVE (withheld staff do not receive payslips). The period status changes to **PAID**.

Employees can also download their payslip as a PDF by logging into the platform.

> You can re-send payslips at any time by clicking **Send Payslip Emails** again on a PAID period.

---

## Chapter 6: Downloading Reports

After payroll is approved (or paid), you can download any of the following reports. Every report is available in three formats — choose the one you need:

- **View on screen** → use the default JSON view
- **Download to Excel** → for editing, sharing with other departments, or submission to agencies
- **Download as PDF** → for signing, archiving, or formal submission

### The 8 available reports

**1. Bank Payment Schedule**
The list you send to the bank to process salaries. Includes staff name, bank name, account number, account name, and the exact amount to credit. Only includes ACTIVE staff (withheld staff are excluded).

**2. Withheld Salaries Report**
The list of staff whose salaries were withheld this month, with the reason for each. Keep this for your records and for management reporting.

**3. Pension Remittance Schedule**
Submitted to each Pension Fund Administrator (PFA). Shows the employee contribution (8%) and employer contribution (10%) for each staff member, grouped by PFA name and RSA PIN.

**4. PAYE Tax Schedule**
Submitted to the Rivers State Internal Revenue Service. Shows each employee's annual gross income, chargeable income, annual PAYE, and monthly PAYE deducted.

**5. ITF Schedule**
Industrial Training Fund levy: 1% of each employee's gross salary, borne by the company. Use this to prepare your ITF remittance.

**6. NSITF Schedule**
Nigeria Social Insurance Trust Fund: 1% of gross salary, company-borne. Use this for NSITF remittance.

**7. NHF Schedule**
National Housing Fund: 2.5% of each employee's basic salary, deducted from the employee. Submitted to the Federal Mortgage Bank of Nigeria.

**8. Cost Centre Summary**
A management report showing payroll cost grouped by region, department, and unit. Shows head count, total gross, total net, total PAYE, and total pension per cost centre. Useful for budget tracking and variance analysis.

### How to download a report

1. Open the pay period
2. Click on **Reports**
3. Choose the report you want
4. Select the format (Excel or PDF)
5. The file will download automatically

---

## Chapter 7: Employee Self-Service

Every staff member whose account has been set up can log into the 24/7HR platform and access their own payslips.

### What staff can do on the platform

- View a list of all their pay periods and net salaries
- Download their payslip for any month as a PDF
- See the full breakdown of their earnings, deductions, and tax

### How staff access the platform

1. Staff receive a welcome email when HR onboards them
2. The email contains their login credentials (email and temporary password)
3. They click the login link in the email and go to the platform
4. On first login, they are required to change their password
5. After that, they can log in any time with their new password

### What staff see on their payslip

Each payslip PDF shows:
- Employee details (name, staff ID, grade, department, region)
- Earnings breakdown (basic, all allowances, overtime)
- Deductions breakdown (pension, NHF, PAYE, union dues, cooperative)
- Gross salary and net salary
- Tax computation detail (NTA 2025)
- Banking and pension details

### Important note for staff

Staff can only download payslips for periods that have been **approved or paid** by HR. Payslips for periods still in REVIEW or earlier stages are not yet available.

---

## Chapter 8: Managing Staff Records

### Updating a staff member's information

1. Go to **Staff**
2. Search for the staff member by name or staff ID
3. Click on their name to open their record
4. Make the necessary changes (grade, bank details, department, etc.)
5. Click **Save**

> Changes to salary or grade take effect from the **next time payroll is computed**. They do not retroactively change past payslips.

### Deactivating a staff member (offboarding)

When a staff member leaves the company:

1. Open their staff record
2. Click **Deactivate Staff**
3. Confirm

The staff member is marked inactive and will not appear in future pay period validations or payroll computations. Their historical records remain intact.

> Deactivation is a soft delete — the record is never permanently deleted. If a staff member rejoins later, their account can be reactivated.

### Changing bank details

Update the staff member's bank name, account number, and account name in their profile. The updated details are used from the next payroll computation onwards.

### Changing grade or salary

If a staff member is promoted or their salary changes:
1. Open their record
2. Update the **Grade** field (for grade changes) or enter a **Basic Salary Override** (to set a salary different from the grade default)
3. Save the record
4. The new salary applies when payroll is next computed

### Managing Union and Cooperative Memberships

Memberships can change at any time — new hires join unions, existing staff join cooperatives mid-year, or staff resign from a union. Here is how to handle each case cleanly.

#### Adding a membership during an active pay period

1. Open the staff member's record → **Memberships** tab
2. Click **Add Union** or **Add Cooperative**, select from the dropdown, click **Save**
3. Check where the current pay period stands:

   - **Period is DRAFT, VALIDATION OPEN, or VALIDATION CLOSED** → The deduction will be included when you compute payroll. No further action needed.
   - **Period is already in REVIEW** (compute has run) → The membership is saved but the current computed results do not include it. Go to the pay period and click **Compute Payroll** again to regenerate the results with the new deduction.
   - **Period is APPROVED or PAID** → The membership is saved for future months. The current period's payslips are finalised and will not change.

#### Removing a membership during an active pay period

1. Open the staff member's record → **Memberships** tab
2. Click **Remove** next to the union or cooperative, click **Confirm**
3. Apply the same timing rule as above:
   - Before compute → deduction is excluded from the current run automatically
   - After compute, before approval → recompute to drop the deduction
   - After approval or payment → takes effect from next month

#### Adding multiple members at once (mid-year bulk assignment)

When a union or cooperative chairman submits a batch of new members at any point in the year — not just during initial setup — use the Chairman Upload:

1. Go to **Configuration → Unions** (or **Cooperatives**)
2. Open the relevant union or cooperative
3. Click **Download Member Template** — this generates a fresh template pre-populated with all staff
4. Give the template to the chairman to fill in
5. Click **Upload Members** to process the file

This is faster and less error-prone than going into each staff record individually. After uploading:
- Check the upload summary (Added / Skipped / Failed)
- If the pay period has already been computed, recompute to apply the new deductions

#### What the deduction looks like on the payslip

Each union and cooperative a staff member belongs to appears as a separate line on their payslip:

```
Deductions
  PAYE (Income Tax)          ₦ 42,500.00
  Pension (Employee 8%)      ₦ 20,000.00
  NHF                        ₦  6,250.00
  NUEE Union Dues            ₦  2,000.00       ← fixed naira amount
  PHED Staff Cooperative     ₦ 21,375.00       ← % of gross salary
                           ──────────────
  Total Deductions           ₦ 92,125.00
```

A staff member belonging to two cooperatives would have two cooperative deduction lines, each calculated independently as a percentage of gross.

---

## Chapter 9: Frequently Asked Questions

**Q: What happens if I compute payroll and then find an error?**  
A: No problem. Fix the error in the relevant staff record (e.g. wrong grade, missing overtime), then click **Compute Payroll** again on the same pay period. The system recalculates and replaces the previous results. You can recompute as many times as needed before approving.

**Q: Can I add a staff member to the payroll after validation has closed?**  
A: Yes. Add the staff member to the system, update their salary details, then recompute payroll. The newly added staff member will be included in the recomputation.

**Q: A staff member was accidentally marked NO in validation. Can I change it?**  
A: Yes, as long as the pay period has not been approved. Upload a corrected validation file with the staff member set to YES. The upload updates their status. Then close validation (if it was open) and recompute.

**Q: I uploaded the wrong overtime hours. What do I do?**  
A: Upload a corrected overtime file — the system updates the hours. Then recompute payroll to apply the correction.

**Q: A staff member did not receive their welcome email. What do I do?**  
A: Go to their staff record and check that their email address is correct. If it is wrong, update it. Then contact your system administrator to resend the welcome email.

**Q: Can a staff member log in before payroll is approved?**  
A: Yes. Staff can log in at any time. However, they can only **download their payslip** for a period once that period has been approved or paid. Before then, the payslip is not yet available.

**Q: The pension schedule shows some staff without an RSA PIN. Is that a problem?**  
A: Staff without an RSA PIN will still appear in the pension schedule, but their RSA PIN field will be blank. You should update their profile with the correct RSA PIN as soon as possible. Contact each staff member's PFA to obtain their PIN if needed.

**Q: Can I run payroll for a past month?**  
A: Yes. Create a pay period for the past month (e.g. January 2026) and run the full process. The system does not restrict you to the current month.

**Q: What is the difference between a grade's basic salary and a staff member's personal basic salary?**  
A: The grade's **default basic salary** is the standard amount for everyone on that grade. If a specific staff member earns a different amount (e.g. due to a personal negotiation or increment), you can set their **Basic Salary Override** directly on their profile. The personal override always takes precedence over the grade default.

**Q: How do I add a new union or cooperative mid-year?**  
A: Create it in Configuration → Unions (or Cooperatives). Then go to each affected staff member's profile and add them to the new union/cooperative (or use the bulk member upload feature if there are many). The deduction will apply from the next payroll computation.

**Q: The chairman gave me a file with members to add. Some are already in the system. Will they be added twice?**  
A: No. The bulk upload is additive and safe to re-run. Staff who are already members are simply skipped — no duplicate deduction is created. Only the truly new members are added.

**Q: I uploaded the member file but some rows show as "Failed". What does that mean?**  
A: A "Failed" row means the Staff ID in that row was not found in the system. Ask the chairman to check the "Staff Directory (Reference)" sheet in the template for the correct Staff ID, correct the file, and re-upload only those rows.

**Q: I assigned a staff member to a union but their payslip doesn't show the deduction. Why?**  
A: The deduction only appears if it was assigned before payroll was computed for that pay period. If the period is still in REVIEW (compute has run but payroll is not yet approved), go to the pay period and click **Compute Payroll** again — the recomputation will pick up the new membership. If the pay period has already been approved or paid, the deduction will appear from next month onwards.

**Q: Can a staff member belong to more than one union or cooperative at the same time?**  
A: Yes. A staff member can be a member of multiple cooperatives simultaneously — each one creates its own percentage deduction line on their payslip. For unions, while a staff member can technically belong to more than one union (if applicable), in practice most PHED employees belong to a single union. Each active membership is deducted separately.

**Q: I tried to add a staff member to a union and got an error saying "Staff is already a member". What do I do?**  
A: The membership already exists in the system. No action is needed — the deduction is already being applied. This often happens when the same staff member appears in both a bulk upload and an individual assignment attempt.

**Q: I tried to add a staff member to a cooperative and got an error saying "Cannot assign an inactive cooperative". What do I do?**  
A: The cooperative has been deactivated. Go to **Configuration → Cooperatives**, open the cooperative, and check its status. If it should be active, click **Reactivate** and then retry the assignment.

**Q: I am seeing an error that says "Too many requests. Please try again later." What do I do?**  
A: The system has built-in rate limiting to protect against overload and abuse. If you see this message, wait a short while and try again — the message will include a "Retry After" time. For compute payroll and bulk uploads, the system allows fewer requests per minute by design. Do not click the button repeatedly; just wait and retry once.

---

## Chapter 10: Glossary

| Term | Meaning |
|---|---|
| **Allowance** | A component of salary in addition to basic pay (e.g. housing, transport) |
| **Basic Salary** | The core fixed monthly payment before allowances |
| **Chargeable Income** | Annual taxable income after deducting pension and rent relief |
| **Cooperative** | A savings/investment group; membership incurs a % deduction from gross salary |
| **DRAFT** | A pay period that has just been created and not yet opened for validation |
| **Grade** | A salary level that defines the pay structure for a group of employees |
| **Gross Salary** | Total earnings before any deductions (basic + allowances + overtime) |
| **ITF** | Industrial Training Fund — 1% of gross salary, paid by the employer |
| **Net Salary** | Take-home pay after all deductions |
| **NHF** | National Housing Fund — 2.5% of basic salary, deducted from the employee |
| **NSITF** | Nigeria Social Insurance Trust Fund — 1% of gross, paid by the employer |
| **NTA 2025** | Nigeria Tax Act 2025 — the legislation governing PAYE calculation |
| **Overtime** | Additional pay for hours worked beyond normal working hours |
| **Pay Period** | A single month of payroll (e.g. April 2026) |
| **PAYE** | Pay As You Earn — income tax deducted monthly and remitted to the tax authority |
| **Pensionable Salary** | Basic + Housing + Transport allowance — the base for pension calculation |
| **PFA** | Pension Fund Administrator — the company managing an employee's pension savings |
| **RSA PIN** | Retirement Savings Account Personal Identification Number |
| **Union** | A workers' organisation; membership incurs a fixed monthly naira deduction |
| **Validation** | The monthly process of confirming which staff should be paid |
| **WITHHELD** | A staff member whose salary has been computed but flagged for non-payment |
| **YES_FOR_PAYMENT / NO_FOR_PAYMENT** | The two validation decisions: pay or withhold a salary |

---

*This document is confidential and intended for use by authorised PHED HR personnel only.*  
*Produced by 24/7HR Platform — Isurf Global Ltd.*
